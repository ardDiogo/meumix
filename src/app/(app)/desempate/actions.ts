"use server";

import { canManageLeagueOf } from "@/services/league";
import { revalidatePath } from "next/cache";
import { canManageMixes } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { audit } from "@/services/audit";
import { getSession } from "@/services/auth";
import { after } from "next/server";
import { notifyTiebreaker } from "@/services/notify";
import { startDraftIfReady } from "@/services/mix-events";
import { closeRound, forceMapDecision, resolveCaptainRound, type RoundRow } from "@/services/tiebreaker";

/** Mapas definidos: se os capitães também estão, a escolha dos times começa. */
async function startPickAfterMaps(scheduleId: string, date: string) {
  const admin = createSupabaseAdminClient();
  if (!admin) return;
  const { data: draft } = await admin
    .from("mix_draft_state")
    .select("status")
    .match({ schedule_id: scheduleId, event_date: date })
    .maybeSingle();
  if (draft) return;
  const { data } = await admin.rpc("mix_classified", { p_schedule: scheduleId, p_date: date });
  await startDraftIfReady(scheduleId, date, (data as string[] | null) ?? []);
}

export type TiebreakResult = { ok: true; message: string } | { ok: false; message: string };
const fail = (message: string): TiebreakResult => ({ ok: false, message });

/** Classificado vota em exatamente `slots` mapas do round; ao completar 10 votos o round fecha. */
export async function submitTiebreakerVote(roundId: string, maps: string[]): Promise<TiebreakResult> {
  const session = await getSession();
  if (!session) return fail("Entre na sua conta para votar.");
  const admin = createSupabaseAdminClient();
  if (!admin) return fail("Servidor não configurado.");

  const { data } = await admin.from("map_tiebreaker_rounds").select("*").eq("id", roundId).maybeSingle();
  const round = data as RoundRow | null;
  if (!round || round.status !== "voting") return fail("Este desempate já foi encerrado.");

  const captainsMode = round.mode === "captains";
  if (captainsMode) {
    // Desempate entre os capitães: só os 2 escolhem.
    const { data: draft } = await admin
      .from("mix_draft_state")
      .select("captain_a, captain_b")
      .match({ schedule_id: round.schedule_id, event_date: round.event_date })
      .maybeSingle();
    if (!draft || ![draft.captain_a, draft.captain_b].includes(session.id))
      return fail("Neste desempate só os capitães escolhem os mapas.");
  } else {
    const { data: classified } = await admin.rpc("mix_classified", {
      p_schedule: round.schedule_id,
      p_date: round.event_date,
    });
    if (!((classified as string[] | null) ?? []).includes(session.id))
      return fail("Só jogadores classificados podem votar.");
  }

  const unique = [...new Set(maps)];
  if (unique.length !== round.slots || unique.some((m) => !round.candidate_maps.includes(m))) {
    return fail(`Escolha exatamente ${round.slots} ${round.slots > 1 ? "mapas" : "mapa"} entre os empatados.`);
  }

  const { error } = await admin
    .from("map_tiebreaker_votes")
    .upsert({ round_id: roundId, user_id: session.id, maps: unique }, { onConflict: "round_id,user_id" });
  if (error) return fail("Não foi possível registrar seu voto.");

  await audit({
    action: "vote.map_tiebreaker",
    outcome: "success",
    actorId: session.id,
    scheduleId: round.schedule_id,
    eventDate: round.event_date,
    detail: { round: round.round_number, maps: unique },
  });
  if (captainsMode) {
    const state = await resolveCaptainRound(roundId);
    revalidatePath("/dashboard");
    return {
      ok: true,
      message:
        state === "completed"
          ? "Mapas definidos!"
          : state === "waiting_ppt"
            ? "Escolha registrada! Vocês discordaram: o mapa fica com quem perder o pedra-papel-tesoura."
            : "Escolha registrada! Aguardando o outro capitão.",
    };
  }
  // O servidor revalida: só fecha quando todos os classificados votaram.
  const closed = await closeRound(roundId);
  // Empate de novo: o round 2 abriu, avisa quem precisa votar. Desempate decidido: libera o PICK.
  if (closed.message.includes("Round 2")) after(() => notifyTiebreaker(round.schedule_id, round.event_date));
  else if (closed.ok) await startPickAfterMaps(round.schedule_id, round.event_date);
  revalidatePath("/dashboard");
  return {
    ok: true,
    message: closed.ok && closed.message !== "Round já encerrado." ? closed.message : "Voto registrado!",
  };
}

/** Admin: força o fechamento do round com os votos atuais. */
export async function forceCloseRound(roundId: string): Promise<TiebreakResult> {
  const session = await getSession();
  if (!canManageMixes(session) || !(await canManageLeagueOf({ roundId })))
    return fail("Apenas administradores da liga podem forçar o fechamento.");
  const { data: row } = await createSupabaseAdminClient()!
    .from("map_tiebreaker_rounds")
    .select("*")
    .eq("id", roundId)
    .maybeSingle();
  if ((row as RoundRow | null)?.mode === "captains") {
    await resolveCaptainRound(roundId, true);
    await audit({
      action: "admin.force_close_tiebreaker",
      outcome: "success",
      actorId: session!.id,
      detail: { round_id: roundId, mode: "captains" },
    });
    revalidatePath("/dashboard");
    return { ok: true, message: "Desempate fechado com as escolhas atuais." };
  }
  const result = await closeRound(roundId, true);
  if (result.message.includes("Round 2")) {
    const { data: r } = await createSupabaseAdminClient()!
      .from("map_tiebreaker_rounds")
      .select("schedule_id, event_date")
      .eq("id", roundId)
      .maybeSingle();
    if (r) after(() => notifyTiebreaker(r.schedule_id as string, r.event_date as string));
  } else if (result.ok) {
    const { data: r } = await createSupabaseAdminClient()!
      .from("map_tiebreaker_rounds")
      .select("schedule_id, event_date")
      .eq("id", roundId)
      .maybeSingle();
    if (r) await startPickAfterMaps(r.schedule_id as string, r.event_date as string);
  }
  await audit({
    action: "admin.force_close_tiebreaker",
    outcome: result.ok ? "success" : "error",
    actorId: session!.id,
    detail: { round_id: roundId },
  });
  revalidatePath("/dashboard");
  return result.ok ? { ok: true, message: result.message } : fail(result.message);
}

/** Admin: encerra a votação de mapas com os votos atuais (quando falta voto e o top 4 está em aberto). */
export async function forceMapVoting(scheduleId: string, date: string): Promise<TiebreakResult> {
  const session = await getSession();
  if (!canManageMixes(session) || !(await canManageLeagueOf({ scheduleId })))
    return fail("Apenas administradores da liga podem encerrar a votação de mapas.");
  const result = await forceMapDecision(scheduleId, date);
  await audit({
    action: "admin.force_map_voting",
    outcome: result.ok ? "success" : "error",
    actorId: session!.id,
    scheduleId,
    eventDate: date,
  });
  if (result.ok && "tiebreak" in result && result.tiebreak) after(() => notifyTiebreaker(scheduleId, date));
  else if (result.ok) await startPickAfterMaps(scheduleId, date);
  revalidatePath("/dashboard");
  return result.ok ? { ok: true, message: result.message } : fail(result.message);
}
