"use server";

import { revalidatePath } from "next/cache";
import { canManageMixes } from "@/lib/auth/permissions";
import { sanitizeChronicle, type Chronicle } from "@/lib/chronicle";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { audit } from "@/services/audit";
import { getSession } from "@/services/auth";
import { generateChronicle } from "@/services/chronicle";

export type ChronicleResult = { ok: boolean; message: string };

const validId = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

function refresh() {
  revalidatePath("/mixes", "layout");
}

/** Gera a crônica de novo (nova versão da IA, ou o modelo pronto sem IA). */
export async function regenerateChronicle(matchId: string): Promise<ChronicleResult> {
  const session = await getSession();
  if (!canManageMixes(session)) return { ok: false, message: "Apenas administradores." };
  if (!validId(matchId)) return { ok: false, message: "Mix inválido." };
  const r = await generateChronicle(matchId, session!.id);
  if (!r.ok) return { ok: false, message: r.message };
  await audit({
    action: "admin.chronicle",
    outcome: "success",
    actorId: session!.id,
    detail: { matchId, source: r.source },
  });
  refresh();
  return {
    ok: true,
    message:
      r.source === "ia"
        ? "Crônica nova gerada."
        : r.aiTried
          ? "Crônica gerada pelo modelo pronto (a IA não respondeu)."
          : "Crônica gerada pelo modelo pronto.",
  };
}

/** Salva a crônica editada pelo admin. */
export async function saveChronicle(matchId: string, content: Chronicle): Promise<ChronicleResult> {
  const session = await getSession();
  if (!canManageMixes(session)) return { ok: false, message: "Apenas administradores." };
  const clean = sanitizeChronicle(content, 1);
  if (!validId(matchId) || !clean) return { ok: false, message: "Preencha a abertura e pelo menos um tópico." };
  const admin = createSupabaseAdminClient();
  if (!admin) return { ok: false, message: "Servidor não configurado." };
  const { error } = await admin
    .from("mix_chronicles")
    .upsert(
      { match_id: matchId, content: clean, source: "admin", updated_by: session!.id },
      { onConflict: "match_id" },
    );
  if (error) return { ok: false, message: "Não foi possível salvar." };
  await audit({
    action: "admin.chronicle",
    outcome: "success",
    actorId: session!.id,
    detail: { matchId, source: "admin" },
  });
  refresh();
  return { ok: true, message: "Crônica salva." };
}

/** Oculta ou mostra a crônica no site e na imagem. */
export async function setChronicleHidden(matchId: string, hidden: boolean): Promise<ChronicleResult> {
  const session = await getSession();
  if (!canManageMixes(session)) return { ok: false, message: "Apenas administradores." };
  const admin = createSupabaseAdminClient();
  if (!admin || !validId(matchId)) return { ok: false, message: "Não foi possível salvar." };
  const { error } = await admin
    .from("mix_chronicles")
    .update({ hidden, updated_by: session!.id })
    .eq("match_id", matchId);
  if (error) return { ok: false, message: "Não foi possível salvar." };
  refresh();
  return { ok: true, message: hidden ? "Crônica ocultada." : "Crônica visível de novo." };
}
