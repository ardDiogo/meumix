"use server";

import { revalidatePath } from "next/cache";
import { canManageMixes } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { audit } from "@/services/audit";
import { getSession } from "@/services/auth";
import { detectTiebreaker } from "@/services/tiebreaker";

export type DraftResult = { ok: true; message: string } | { ok: false; message: string };
const fail = (message: string): DraftResult => ({ ok: false, message });

/** Mensagens das exceções levantadas pelas funções do banco (0005_draft.sql). */
const DB_ERRORS: Record<string, string> = {
  NOT_ENOUGH_PLAYERS: "São necessários 10 jogadores classificados para iniciar a seleção.",
  DRAFT_NOT_STARTED: "A seleção de equipes ainda não começou.",
  PPT_FINISHED: "A disputa de pedra, papel ou tesoura já terminou.",
  NOT_CAPTAIN: "Apenas os capitães podem fazer isso.",
  ALREADY_READY: "Você já confirmou sua jogada. Aguarde o outro capitão.",
  INVALID_CHOICE: "Jogada inválida.",
  NOT_PICKING: "A escolha dos times não está em andamento.",
  NOT_YOUR_TURN: "Não é a sua vez de escolher.",
  PLAYER_TAKEN: "Esse jogador já foi escolhido.",
  NOT_CLASSIFIED: "Só é possível escolher jogadores classificados.",
};
const dbMessage = (msg: string | undefined) =>
  Object.entries(DB_ERRORS).find(([code]) => msg?.includes(code))?.[1] ?? "Não foi possível concluir. Tente novamente.";

function refresh() {
  revalidatePath("/dashboard");
}

/** Inicia a disputa: os 2 mais votados viram capitães. Admin ou automático. */
export async function startDraft(scheduleId: string, date: string): Promise<DraftResult> {
  const session = await getSession();
  if (!canManageMixes(session)) return fail("Apenas administradores podem iniciar a seleção.");
  const admin = createSupabaseAdminClient();
  if (!admin) return fail("Servidor não configurado.");
  const { error } = await admin.rpc("draft_start", { p_schedule: scheduleId, p_date: date });
  if (error) return fail(dbMessage(error.message));
  // Admin iniciou os capitães: a sugestão pendente deixa de valer.
  await admin
    .from("mix_team_suggestions")
    .update({ status: "rejected", decided_at: new Date().toISOString() })
    .match({ schedule_id: scheduleId, event_date: date })
    .eq("status", "pending");
  await audit({
    action: "admin.force_start_draft",
    outcome: "success",
    actorId: session!.id,
    scheduleId,
    eventDate: date,
  });
  refresh();
  return { ok: true, message: "Seleção de equipes iniciada!" };
}

/** Capitão envia a jogada do PPT; o banco decide o resultado. */
export async function submitPpt(scheduleId: string, date: string, choice: string): Promise<DraftResult> {
  const session = await getSession();
  if (!session) return fail("Entre na sua conta.");
  const admin = createSupabaseAdminClient();
  if (!admin) return fail("Servidor não configurado.");
  const { data, error } = await admin.rpc("draft_ppt_submit", {
    p_schedule: scheduleId,
    p_date: date,
    p_user: session.id,
    p_choice: choice,
  });
  if (error) return fail(dbMessage(error.message));
  refresh();
  const messages: Record<string, string> = {
    waiting: "Jogada confirmada! Aguardando o outro capitão.",
    tie: "Empate! Joguem de novo.",
    win: "Disputa encerrada!",
  };
  return { ok: true, message: messages[data as string] ?? "Jogada registrada." };
}

/** Capitão escolhe um jogador; o banco relê o estado travado e valida a vez. */
export async function pickPlayer(scheduleId: string, date: string, playerId: string): Promise<DraftResult> {
  const session = await getSession();
  if (!session) return fail("Entre na sua conta.");
  const admin = createSupabaseAdminClient();
  if (!admin) return fail("Servidor não configurado.");
  const { data, error } = await admin.rpc("draft_pick", {
    p_schedule: scheduleId,
    p_date: date,
    p_user: session.id,
    p_player: playerId,
  });
  if (error) return fail(dbMessage(error.message));
  // Escolha concluída → checa desempate de mapas (idempotente).
  if ((data as { status?: string } | null)?.status === "completed") await detectTiebreaker(scheduleId, date);
  refresh();
  return { ok: true, message: "Jogador escolhido!" };
}

/**
 * Admin: `draft` zera a disputa e as escolhas (mantém os votos de capitão);
 * `all` também apaga os votos de capitão.
 */
export async function resetDraft(scheduleId: string, date: string, scope: "draft" | "all"): Promise<DraftResult> {
  const session = await getSession();
  if (!canManageMixes(session)) return fail("Apenas administradores podem reiniciar a seleção.");
  const admin = createSupabaseAdminClient();
  if (!admin) return fail("Servidor não configurado.");
  const match = { schedule_id: scheduleId, event_date: date };
  const draft = await admin.from("mix_draft_state").delete().match(match);
  if (draft.error) return fail("Não foi possível reiniciar a seleção.");
  // Reiniciar a escolha também descarta o desempate de mapas (depende dos times).
  await admin.from("map_tiebreaker_rounds").delete().match(match);
  // A sugestão de times (se houver) é refeita e votada de novo.
  await admin.from("mix_team_suggestions").delete().match(match);
  if (scope === "all") {
    const votes = await admin.from("captain_votes").delete().match(match);
    if (votes.error) return fail("A seleção foi reiniciada, mas os votos de capitão não foram apagados.");
  }
  await audit({
    action: scope === "all" ? "admin.reset_all" : "admin.reset_draft",
    outcome: "success",
    actorId: session!.id,
    scheduleId,
    eventDate: date,
  });
  refresh();
  return { ok: true, message: scope === "all" ? "Seleção e votos de capitão reiniciados." : "Seleção reiniciada." };
}
