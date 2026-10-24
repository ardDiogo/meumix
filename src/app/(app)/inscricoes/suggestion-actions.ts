"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { canManageMixes } from "@/lib/auth/permissions";
import { ACCEPT_RATIO } from "@/lib/team-balance";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { audit } from "@/services/audit";
import { getSession } from "@/services/auth";
import { notifyTeamsDefined } from "@/services/notify";
import { detectTiebreaker } from "@/services/tiebreaker";

export type SuggestionResult = { ok: boolean; message: string };

const fail = (message: string): SuggestionResult => ({ ok: false, message });

async function context(scheduleId: string, date: string) {
  const admin = createSupabaseAdminClient();
  if (!admin) return { error: "Servidor não configurado." } as const;
  const match = { schedule_id: scheduleId, event_date: date };
  const [{ data: schedule }, { data: regs }, { data: suggestion, error }, { data: draft }] = await Promise.all([
    admin.from("mix_schedules").select("max_players").eq("id", scheduleId).maybeSingle(),
    admin.from("mix_registrations").select("user_id").match(match).order("created_at"),
    admin.from("mix_team_suggestions").select("*").match(match).maybeSingle(),
    admin.from("mix_draft_state").select("status").match(match).maybeSingle(),
  ]);
  if (error) return { error: "Rode a migração 0014_team_suggestion.sql no Supabase." } as const;
  if (!schedule) return { error: "Mix não encontrado." } as const;
  const classified = (regs ?? []).slice(0, schedule.max_players as number).map((r) => r.user_id as string);
  return { admin, match, classified, suggestion, draft } as const;
}

/** Aceita: os times viram a escolha concluída (pula capitães e PPT). */
async function accept(
  admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  match: { schedule_id: string; event_date: string },
  teamA: string[],
  teamB: string[],
) {
  const { error } = await admin.from("mix_draft_state").upsert(
    {
      ...match,
      status: "completed",
      captain_a: teamA[0],
      captain_b: teamB[0],
      a_ready: true,
      b_ready: true,
      team_a: teamA,
      team_b: teamB,
      current_turn: null,
    },
    { onConflict: "schedule_id,event_date", ignoreDuplicates: true },
  );
  if (error) return false;
  await admin
    .from("mix_team_suggestions")
    .update({ status: "accepted", decided_at: new Date().toISOString() })
    .match(match);
  await detectTiebreaker(match.schedule_id, match.event_date);
  after(() => notifyTeamsDefined(match.schedule_id, match.event_date));
  return true;
}

export async function voteSuggestion(scheduleId: string, date: string, agree: boolean): Promise<SuggestionResult> {
  const session = await getSession();
  if (!session) return fail("Entre na sua conta para votar.");
  const ctx = await context(scheduleId, date);
  if ("error" in ctx) return fail(ctx.error!);
  const { admin, match, classified, suggestion, draft } = ctx;
  if (!suggestion) return fail("Não há sugestão de times para este mix.");
  if (suggestion.status !== "pending" || draft) return fail("A votação da sugestão já foi encerrada.");
  if (!classified.includes(session.id)) return fail("Só jogadores classificados podem votar.");
  const members = [...(suggestion.team_a as string[]), ...(suggestion.team_b as string[])];
  if (members.length !== classified.length || !members.every((id) => classified.includes(id))) {
    return fail("Os classificados mudaram. Atualize a página para ver a nova sugestão.");
  }

  const { error } = await admin
    .from("mix_team_suggestion_votes")
    .upsert({ ...match, user_id: session.id, agree }, { onConflict: "schedule_id,event_date,user_id" });
  if (error) return fail("Não foi possível registrar seu voto.");

  const { data: votes } = await admin.from("mix_team_suggestion_votes").select("user_id, agree").match(match);
  const counted = (votes ?? []).filter((v) => classified.includes(v.user_id as string));
  const yes = counted.filter((v) => v.agree).length;
  const no = counted.length - yes;
  const needed = Math.ceil(classified.length * ACCEPT_RATIO);
  let message = agree ? "Voto registrado: concordo." : "Voto registrado: não concordo.";

  if (yes >= needed) {
    if (await accept(admin, match, suggestion.team_a as string[], suggestion.team_b as string[])) {
      message = "Sugestão aceita! Os times estão definidos.";
    }
  } else if (no > classified.length - needed) {
    // Não há mais como chegar a 80%: segue para a votação de capitães.
    await admin
      .from("mix_team_suggestions")
      .update({ status: "rejected", decided_at: new Date().toISOString() })
      .match(match);
    message = "Sugestão recusada. O mix segue para a votação de capitães.";
  }
  await audit({
    action: "vote.team_suggestion",
    outcome: "success",
    actorId: session.id,
    scheduleId,
    eventDate: date,
    detail: { agree },
  });
  revalidatePath("/dashboard");
  return { ok: true, message };
}

/** Admin: aceita ou descarta a sugestão sem esperar os votos. */
export async function decideSuggestion(scheduleId: string, date: string, accepted: boolean): Promise<SuggestionResult> {
  const session = await getSession();
  if (!canManageMixes(session)) return fail("Apenas administradores.");
  const ctx = await context(scheduleId, date);
  if ("error" in ctx) return fail(ctx.error!);
  const { admin, match, suggestion, draft } = ctx;
  if (!suggestion || suggestion.status !== "pending" || draft) return fail("Não há sugestão pendente.");
  if (accepted) {
    if (!(await accept(admin, match, suggestion.team_a as string[], suggestion.team_b as string[]))) {
      return fail("Não foi possível aceitar a sugestão.");
    }
  } else {
    await admin
      .from("mix_team_suggestions")
      .update({ status: "rejected", decided_at: new Date().toISOString() })
      .match(match);
  }
  await audit({
    action: "admin.team_suggestion",
    outcome: "success",
    actorId: session!.id,
    scheduleId,
    eventDate: date,
    detail: { accepted },
  });
  revalidatePath("/dashboard");
  return {
    ok: true,
    message: accepted ? "Times da sugestão confirmados." : "Sugestão descartada: segue para capitães.",
  };
}
