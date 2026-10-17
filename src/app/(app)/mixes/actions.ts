"use server";

import { revalidatePath } from "next/cache";
import { canManageMixes } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { audit } from "@/services/audit";
import { getSession } from "@/services/auth";

export type MatchActionResult = { ok: boolean; message: string };

/** Placar da série em mapas (ex.: "2 x 1"), para o log. */
function placar(maps: unknown) {
  if (!Array.isArray(maps)) return null;
  let a = 0;
  let b = 0;
  for (const m of maps as { score_a?: number; score_b?: number }[]) {
    if ((m.score_a ?? 0) > (m.score_b ?? 0)) a++;
    else if ((m.score_b ?? 0) > (m.score_a ?? 0)) b++;
  }
  return `${a} x ${b}`;
}

/** Exclui um mix finalizado e desfaz o ELO que ele aplicou (admin). */
export async function deleteMatch(matchId: string): Promise<MatchActionResult> {
  const session = await getSession();
  if (!canManageMixes(session)) return { ok: false, message: "Apenas administradores podem excluir mixes." };
  const admin = createSupabaseAdminClient();
  if (!admin) return { ok: false, message: "O banco de dados não está configurado no servidor." };
  if (!/^[0-9a-f-]{36}$/i.test(matchId)) return { ok: false, message: "Mix inválido." };

  const { data: match } = await admin
    .from("mix_matches")
    .select("schedule_id, event_date, maps")
    .eq("id", matchId)
    .maybeSingle();
  const { data, error } = await admin.rpc("delete_match", { p_match: matchId, p_by: session!.id });
  if (error) {
    return {
      ok: false,
      message:
        error.code === "PGRST202" || error.code === "42883"
          ? "Rode a migração 0016_delete_match.sql no Supabase."
          : error.message.includes("MATCH_NOT_FOUND")
            ? "Esse mix já foi excluído."
            : "Não foi possível excluir o mix.",
    };
  }
  await audit({
    action: "admin.delete_match",
    outcome: "success",
    actorId: session!.id,
    scheduleId: (match?.schedule_id as string | null) ?? null,
    eventDate: (match?.event_date as string | null) ?? null,
    detail: {
      mix: match ? `Mix de ${String(match.event_date).split("-").reverse().slice(0, 2).join("/")}` : matchId,
      placar: placar(match?.maps),
      jogadoresComEloDesfeito: data ?? 0,
    },
  });
  revalidatePath("/", "layout");
  return { ok: true, message: `Mix excluído. ELO desfeito para ${data ?? 0} jogador(es).` };
}

/** Corrige a data de um mix finalizado (ex.: finalizado na ocorrência errada). */
export async function updateMatchDate(matchId: string, date: string): Promise<MatchActionResult> {
  const session = await getSession();
  if (!canManageMixes(session)) return { ok: false, message: "Apenas administradores podem alterar a data." };
  const admin = createSupabaseAdminClient();
  if (!admin) return { ok: false, message: "O banco de dados não está configurado no servidor." };
  if (!/^[0-9a-f-]{36}$/i.test(matchId)) return { ok: false, message: "Mix inválido." };
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(`${date}T12:00:00Z`));
  if (!valid || new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date) {
    return { ok: false, message: "Data inválida." };
  }

  const { data: match } = await admin
    .from("mix_matches")
    .select("schedule_id, event_date")
    .eq("id", matchId)
    .maybeSingle();
  if (!match) return { ok: false, message: "Mix não encontrado." };
  if (match.event_date === date) return { ok: true, message: "A data já é essa." };
  const { error } = await admin.from("mix_matches").update({ event_date: date }).eq("id", matchId);
  if (error) {
    return {
      ok: false,
      message: error.code === "23505" ? "Já existe um mix finalizado nessa data." : "Não foi possível alterar a data.",
    };
  }
  await audit({
    action: "admin.match_date",
    outcome: "success",
    actorId: session!.id,
    scheduleId: (match.schedule_id as string | null) ?? null,
    eventDate: date,
    detail: { de: match.event_date, para: date },
  });
  revalidatePath("/", "layout");
  return { ok: true, message: "Data do mix atualizada." };
}
