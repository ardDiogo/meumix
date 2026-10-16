"use server";

import { revalidatePath } from "next/cache";
import { canManageMixes } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { audit } from "@/services/audit";
import { getSession } from "@/services/auth";
import { closeRound, type RoundRow } from "@/services/tiebreaker";

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

  const { data: classified } = await admin.rpc("mix_classified", {
    p_schedule: round.schedule_id,
    p_date: round.event_date,
  });
  if (!((classified as string[] | null) ?? []).includes(session.id))
    return fail("Só jogadores classificados podem votar.");

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
  // O servidor revalida: só fecha quando todos os classificados votaram.
  const closed = await closeRound(roundId);
  revalidatePath("/dashboard");
  return {
    ok: true,
    message: closed.ok && closed.message !== "Round já encerrado." ? closed.message : "Voto registrado!",
  };
}

/** Admin: força o fechamento do round com os votos atuais. */
export async function forceCloseRound(roundId: string): Promise<TiebreakResult> {
  const session = await getSession();
  if (!canManageMixes(session)) return fail("Apenas administradores podem forçar o fechamento.");
  const result = await closeRound(roundId, true);
  await audit({
    action: "admin.force_close_tiebreaker",
    outcome: result.ok ? "success" : "error",
    actorId: session!.id,
    detail: { round_id: roundId },
  });
  revalidatePath("/dashboard");
  return result.ok ? { ok: true, message: result.message } : fail(result.message);
}
