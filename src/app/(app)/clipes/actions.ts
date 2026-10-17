"use server";

import { revalidatePath } from "next/cache";
import { parseAllstarClip } from "@/lib/allstar";
import { clipKindFromAllstar, fetchAllstarMatch, parseAllstarMatchUrl } from "@/lib/integrations/allstar-api";
import { canManageMixes } from "@/lib/auth/permissions";
import { getClips, getTwitchUsers, twitchConfigured } from "@/lib/integrations/twitch-api";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { mixBroadcastWindow, parseTwitchClip } from "@/lib/twitch";
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

/** Envia um clipe do Allstar ou da Twitch (o próprio jogador, ou um admin em nome de alguém). */
export async function addClip(input: ClipInput): Promise<ClipResult> {
  const session = await getSession();
  if (!session) return { ok: false, message: "Entre na sua conta para enviar clipes." };
  const admin = createSupabaseAdminClient();
  if (!admin) return { ok: false, message: "O banco de dados não está configurado no servidor." };

  const twitchId = parseTwitchClip(input.url);
  const clipId = twitchId ?? parseAllstarClip(input.url);
  if (!clipId) {
    return {
      ok: false,
      message: "Link inválido. Use o link do clipe no Allstar (allstar.gg/clip/…) ou na Twitch (clips.twitch.tv/…).",
    };
  }
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
    provider: twitchId ? "twitch" : "allstar",
    clip_id: clipId,
    title,
    kind,
    created_by: session.id,
  });
  if (error) {
    if (error.code === "23505") return { ok: false, message: "Esse clipe já foi enviado." };
    if (twitchId && error.code === "23514")
      return { ok: false, message: "Rode a migração 0022_twitch.sql no Supabase." };
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

/**
 * Admin: importa os clipes criados na Twitch durante o mix, nos canais dos
 * jogadores que jogaram (o clipe fica no perfil de quem transmitiu).
 */
export async function importTwitchClips(matchId: string): Promise<ImportResult> {
  const session = await getSession();
  if (!canManageMixes(session)) return { ok: false, message: "Apenas administradores podem importar clipes." };
  const admin = createSupabaseAdminClient();
  if (!admin || !UUID.test(matchId)) return { ok: false, message: "Mix inválido." };
  if (!twitchConfigured()) {
    return {
      ok: false,
      message: "Twitch não configurada: adicione TWITCH_CLIENT_ID e TWITCH_CLIENT_SECRET na Vercel.",
    };
  }

  const { data: match } = await admin.from("mix_matches").select("event_date").eq("id", matchId).maybeSingle();
  if (!match?.event_date) return { ok: false, message: "Mix não encontrado." };
  const { data: records } = await admin.from("player_match_records").select("user_id").eq("match_id", matchId);
  const userIds = [
    ...new Set((records ?? []).map((r) => r.user_id as string | null).filter((id): id is string => !!id)),
  ];
  if (!userIds.length) return { ok: false, message: "Esse mix não tem jogadores cadastrados." };
  const { data: profiles, error: profileError } = await admin
    .from("profiles")
    .select("id, display_name, twitch_login")
    .in("id", userIds);
  if (profileError) {
    return {
      ok: false,
      message:
        profileError.code === "42703" ? "Rode a migração 0022_twitch.sql no Supabase." : "Erro ao ler os jogadores.",
    };
  }
  const streamers = (profiles ?? []).filter((p) => typeof p.twitch_login === "string" && p.twitch_login);
  if (!streamers.length) {
    return { ok: false, message: "Nenhum jogador deste mix tem o canal da Twitch cadastrado." };
  }

  const { start, end } = mixBroadcastWindow(`${match.event_date}T23:00:00Z`);
  const details: string[] = [];
  const rows: Record<string, unknown>[] = [];
  try {
    const users = new Map(
      (await getTwitchUsers(streamers.map((p) => p.twitch_login as string))).map((u) => [u.login, u]),
    );
    for (const p of streamers) {
      const user = users.get(p.twitch_login as string);
      if (!user) {
        details.push(`${p.display_name}: canal “${p.twitch_login}” não encontrado na Twitch.`);
        continue;
      }
      const clips = await getClips(user.id, start, end);
      if (clips.length) details.push(`${p.display_name}: ${clips.length} clipe(s).`);
      for (const c of clips) {
        const title = c.title.trim().replace(/\s+/g, " ").slice(0, 80) || `Clipe da live de ${p.display_name}`;
        rows.push({
          user_id: p.id,
          match_id: matchId,
          provider: "twitch",
          clip_id: c.id,
          title,
          kind: "clip",
          thumbnail_url: c.thumbnailUrl,
          video_url: null,
          created_by: session!.id,
        });
      }
    }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Falha ao consultar a Twitch.", details };
  }
  if (!rows.length) {
    return { ok: true, message: "Nenhum clipe criado nos canais durante o mix.", imported: 0, details };
  }

  const { data: existing } = await admin
    .from("clips")
    .select("clip_id")
    .eq("provider", "twitch")
    .in(
      "clip_id",
      rows.map((r) => r.clip_id as string),
    );
  const known = new Set((existing ?? []).map((c) => c.clip_id as string));
  const fresh = rows.filter((r) => !known.has(r.clip_id as string));
  if (fresh.length) {
    const { error } = await admin.from("clips").insert(fresh);
    if (error) {
      return {
        ok: false,
        message:
          error.code === "23514" || error.code === "42703" || isMissing(error.code)
            ? "Rode a migração 0022_twitch.sql no Supabase."
            : "Não foi possível salvar os clipes.",
        details,
      };
    }
  }
  await audit({
    action: "clip.import_twitch",
    outcome: "success",
    actorId: session!.id,
    detail: { match_id: matchId, importados: fresh.length, ja_existiam: rows.length - fresh.length },
  });
  refresh();
  return {
    ok: true,
    message: fresh.length
      ? `${fresh.length} clipe(s) da Twitch importado(s)${rows.length - fresh.length ? `; ${rows.length - fresh.length} já estavam no MeuMix` : ""}.`
      : "Todos os clipes da Twitch já estavam no MeuMix.",
    imported: fresh.length,
    details,
  };
}
