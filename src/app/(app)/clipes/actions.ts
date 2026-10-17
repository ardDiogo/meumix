"use server";

import { revalidatePath } from "next/cache";
import { parseAllstarClip } from "@/lib/allstar";
import { canManageMixes } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { audit } from "@/services/audit";
import { getSession } from "@/services/auth";

export type ClipResult = { ok: boolean; message: string };

const KINDS = ["clip", "ace", "clutch", "multikill", "other"] as const;
const UUID = /^[0-9a-f-]{36}$/i;
const MIGRATION_HINT = "Rode a migração 0018_clips.sql no Supabase.";
const isMissing = (code?: string) => code === "42P01" || code === "PGRST205";

function refresh() {
  revalidatePath("/clipes");
  revalidatePath("/jogadores/[id]", "page");
  revalidatePath("/mixes/[id]", "page");
}

export interface ClipInput {
  url: string;
  title: string;
  kind: string;
  matchId: string | null;
  /** Dono do clipe; só administradores escolhem outro jogador. */
  userId: string | null;
}

/** Envia um clipe do Allstar (o próprio jogador, ou um admin em nome de alguém). */
export async function addClip(input: ClipInput): Promise<ClipResult> {
  const session = await getSession();
  if (!session) return { ok: false, message: "Entre na sua conta para enviar clipes." };
  const admin = createSupabaseAdminClient();
  if (!admin) return { ok: false, message: "O banco de dados não está configurado no servidor." };

  const clipId = parseAllstarClip(input.url);
  if (!clipId)
    return { ok: false, message: "Link inválido. Use o “Copy Link” do clipe no Allstar (allstar.gg/clip/…)." };
  const title = input.title.trim().replace(/\s+/g, " ");
  if (title.length < 2 || title.length > 80) return { ok: false, message: "Título: de 2 a 80 caracteres." };
  const kind = (KINDS as readonly string[]).includes(input.kind) ? input.kind : "clip";
  const userId = input.userId && input.userId !== session.id ? input.userId : session.id;
  if (userId !== session.id && !canManageMixes(session)) {
    return { ok: false, message: "Só administradores enviam clipes em nome de outro jogador." };
  }
  if (!UUID.test(userId) || (input.matchId && !UUID.test(input.matchId))) {
    return { ok: false, message: "Dados inválidos." };
  }

  const { error } = await admin.from("clips").insert({
    user_id: userId,
    match_id: input.matchId || null,
    provider: "allstar",
    clip_id: clipId,
    title,
    kind,
    created_by: session.id,
  });
  if (error) {
    if (error.code === "23505") return { ok: false, message: "Esse clipe já foi enviado." };
    if (error.code === "23503") return { ok: false, message: "Mix ou jogador não encontrado." };
    return { ok: false, message: isMissing(error.code) ? MIGRATION_HINT : "Não foi possível salvar o clipe." };
  }
  await audit({
    action: "clip.add",
    outcome: "success",
    actorId: session.id,
    detail: { clip_id: clipId, user_id: userId, match_id: input.matchId || null, title },
  });
  refresh();
  return { ok: true, message: "Clipe enviado!" };
}

/** Exclui um clipe: quem enviou, o dono ou um administrador. */
export async function deleteClip(id: string): Promise<ClipResult> {
  const session = await getSession();
  if (!session) return { ok: false, message: "Entre na sua conta para continuar." };
  const admin = createSupabaseAdminClient();
  if (!admin || !UUID.test(id)) return { ok: false, message: "Não foi possível excluir." };
  const { data: clip } = await admin.from("clips").select("user_id, created_by, title").eq("id", id).maybeSingle();
  if (!clip) return { ok: false, message: "Clipe não encontrado." };
  if (clip.user_id !== session.id && clip.created_by !== session.id && !canManageMixes(session)) {
    return { ok: false, message: "Só quem enviou, o dono do clipe ou um administrador pode excluir." };
  }
  const { error } = await admin.from("clips").delete().eq("id", id);
  if (error) return { ok: false, message: "Não foi possível excluir." };
  await audit({ action: "clip.delete", outcome: "success", actorId: session.id, detail: { id, title: clip.title } });
  refresh();
  return { ok: true, message: "Clipe excluído." };
}
