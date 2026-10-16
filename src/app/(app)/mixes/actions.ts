"use server";

import { revalidatePath } from "next/cache";
import { canManageMixes } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { audit } from "@/services/audit";
import { getSession } from "@/services/auth";

export type MatchActionResult = { ok: boolean; message: string };

/** Exclui um mix finalizado e desfaz o ELO que ele aplicou (admin). */
export async function deleteMatch(matchId: string): Promise<MatchActionResult> {
  const session = await getSession();
  if (!canManageMixes(session)) return { ok: false, message: "Apenas administradores podem excluir mixes." };
  const admin = createSupabaseAdminClient();
  if (!admin) return { ok: false, message: "O banco de dados não está configurado no servidor." };
  if (!/^[0-9a-f-]{36}$/i.test(matchId)) return { ok: false, message: "Mix inválido." };

  const { data: match } = await admin
    .from("mix_matches")
    .select("schedule_id, event_date")
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
    detail: { matchId, eloRevertido: data },
  });
  revalidatePath("/", "layout");
  return { ok: true, message: `Mix excluído. ELO desfeito para ${data ?? 0} jogador(es).` };
}
