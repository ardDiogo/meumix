"use server";

import { revalidatePath } from "next/cache";
import { canManageMixes } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { audit } from "@/services/audit";
import { getSession } from "@/services/auth";

export type LinkResult = { ok: boolean; message: string };

const ERRORS: Record<string, string> = {
  ALREADY_LINKED: "já estava vinculado",
  USER_ALREADY_IN_MATCH: "o jogador já está nesta partida",
  USER_NOT_FOUND: "jogador não encontrado",
  RECORD_NOT_FOUND: "registro não encontrado",
};

/** Liga convidados de uma partida finalizada às contas dos jogadores (admin). */
export async function linkGuests(
  matchId: string,
  links: { recordId: string; userId: string }[],
  applyElo: boolean,
): Promise<LinkResult> {
  const session = await getSession();
  if (!canManageMixes(session)) return { ok: false, message: "Apenas administradores podem vincular jogadores." };
  const admin = createSupabaseAdminClient();
  if (!admin) return { ok: false, message: "O banco de dados não está configurado no servidor." };
  if (!links.length) return { ok: false, message: "Escolha ao menos um jogador." };
  if (new Set(links.map((l) => l.userId)).size !== links.length) {
    return { ok: false, message: "O mesmo jogador foi escolhido para dois convidados." };
  }

  const done: string[] = [];
  const failed: string[] = [];
  for (const link of links) {
    const { error } = await admin.rpc("link_match_record", {
      p_record: link.recordId,
      p_user: link.userId,
      p_by: session!.id,
      p_apply_elo: applyElo,
    });
    if (!error) done.push(link.recordId);
    else if (error.code === "PGRST202" || error.code === "42883") {
      return { ok: false, message: "Rode a migração 0012_link_guests.sql no Supabase." };
    } else {
      const key = Object.keys(ERRORS).find((k) => error.message.includes(k));
      failed.push(key ? ERRORS[key]! : "erro");
    }
  }
  await audit({
    action: "admin.link_guests",
    outcome: failed.length ? "error" : "success",
    actorId: session!.id,
    detail: { matchId, linked: done.length, failed, applyElo },
  });
  revalidatePath("/", "layout");
  if (!done.length) return { ok: false, message: `Nenhum vínculo feito (${failed.join(", ")}).` };
  return {
    ok: true,
    message:
      `${done.length} jogador(es) vinculado(s)${applyElo ? " e ELO atualizado" : ""}.` +
      (failed.length ? ` ${failed.length} falharam: ${failed.join(", ")}.` : ""),
  };
}
