"use server";

import { revalidatePath } from "next/cache";
import { parseAllstarClip } from "@/lib/allstar";
import { clipKindFromAllstar, fetchAllstarMatch, parseAllstarMatchUrl } from "@/lib/integrations/allstar-api";
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

export interface ImportResult {
  ok: boolean;
  message: string;
  imported?: number;
  details?: string[];
}

/**
 * Admin: importa os clipes de um mix a partir dos links "Full match" do Allstar
 * (um por mapa). Consulta cada jogador do mix pelo Steam ID e grava os clipes prontos.
 */
export async function importAllstarClips(matchId: string, links: string[]): Promise<ImportResult> {
  const session = await getSession();
  if (!canManageMixes(session)) return { ok: false, message: "Apenas administradores podem importar clipes." };
  const admin = createSupabaseAdminClient();
  if (!admin || !UUID.test(matchId)) return { ok: false, message: "Mix inválido." };

  const parsed = links
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 5)
    .map((l) => ({ link: l, ref: parseAllstarMatchUrl(l) }));
  const bad = parsed.filter((p) => !p.ref);
  if (!parsed.length || bad.length) {
    return { ok: false, message: "Cole os links “Full match” do Allstar (allstar.gg/match/…), um por linha." };
  }

  // Jogadores do mix com Steam ID vinculado.
  const { data: records } = await admin.from("player_match_records").select("user_id").eq("match_id", matchId);
  const userIds = [
    ...new Set((records ?? []).map((r) => r.user_id as string | null).filter((id): id is string => !!id)),
  ];
  if (!userIds.length) return { ok: false, message: "Esse mix não tem jogadores cadastrados." };
  const { data: profiles } = await admin.from("profiles").select("id, display_name, steam_id").in("id", userIds);
  const withSteam = (profiles ?? []).filter(
    (p) => typeof p.steam_id === "string" && /^7656119\d{10}$/.test(p.steam_id),
  );
  const details: string[] = [];
  const noSteam = (profiles ?? []).filter((p) => !withSteam.includes(p)).map((p) => p.display_name as string);
  if (noSteam.length) details.push(`Sem Steam vinculada (não consultados): ${noSteam.join(", ")}.`);
  if (!withSteam.length) return { ok: false, message: "Nenhum jogador do mix tem a Steam vinculada.", details };

  const rows = new Map<string, Record<string, unknown>>();
  let pending = 0;
  for (const { ref } of parsed) {
    const results = await Promise.all(
      withSteam.map(async (p) => ({ p, r: await fetchAllstarMatch(ref!.matchId, p.steam_id as string) })),
    );
    const auth = results.find((x) => !x.r.ok && x.r.auth);
    if (auth && !auth.r.ok) {
      return { ok: false, message: `O Allstar exige login para ler essa partida. ${auth.r.message}`, details };
    }
    for (const { p, r } of results) {
      if (!r.ok) {
        details.push(`${p.display_name}: ${r.message}`);
        continue;
      }
      for (const m of r.moments) {
        if (!m.videoUrl) {
          pending++;
          continue;
        }
        if (rows.has(m.shareId)) continue;
        rows.set(m.shareId, {
          user_id: p.id,
          match_id: matchId,
          provider: "allstar",
          clip_id: m.shareId,
          title: m.title.length >= 1 ? m.title : "Clipe",
          kind: clipKindFromAllstar(m.title, m.tags),
          thumbnail_url: m.thumbnailUrl,
          video_url: m.videoUrl,
          created_by: session!.id,
        });
      }
    }
  }
  if (pending) details.push(`${pending} momento(s) ainda sem clipe pronto no Allstar; importe de novo mais tarde.`);
  if (!rows.size) return { ok: true, message: "Nenhum clipe pronto encontrado nessas partidas.", imported: 0, details };

  const { data: existing } = await admin
    .from("clips")
    .select("clip_id")
    .in("clip_id", [...rows.keys()]);
  const known = new Set((existing ?? []).map((c) => c.clip_id as string));
  const fresh = [...rows.values()].filter((r) => !known.has(r.clip_id as string));
  if (fresh.length) {
    const { error } = await admin.from("clips").insert(fresh);
    if (error) {
      const missing = error.code === "42703" || isMissing(error.code);
      return {
        ok: false,
        message: missing
          ? "Rode as migrações 0018_clips.sql e 0019_clip_media.sql no Supabase."
          : "Não foi possível salvar os clipes.",
        details,
      };
    }
  }
  await audit({
    action: "clip.import",
    outcome: "success",
    actorId: session!.id,
    detail: {
      match_id: matchId,
      links: parsed.length,
      importados: fresh.length,
      ja_existiam: rows.size - fresh.length,
    },
  });
  refresh();
  return {
    ok: true,
    message: fresh.length
      ? `${fresh.length} clipe(s) importado(s)${rows.size - fresh.length ? `; ${rows.size - fresh.length} já estavam no MeuMix` : ""}.`
      : "Todos os clipes encontrados já estavam no MeuMix.",
    imported: fresh.length,
    details,
  };
}
