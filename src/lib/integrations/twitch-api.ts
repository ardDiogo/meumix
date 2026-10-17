import "server-only";
import { parseTwitchDuration } from "@/lib/twitch";

/**
 * API oficial da Twitch (Helix) com token de aplicativo (client credentials):
 * só dados públicos — quem está ao vivo, gravações e clipes dos canais.
 * Requer `TWITCH_CLIENT_ID` e `TWITCH_CLIENT_SECRET`; sem eles tudo devolve vazio.
 * `TWITCH_API_URL` e `TWITCH_AUTH_URL` permitem trocar os endereços (testes).
 */
const API = () => process.env.TWITCH_API_URL?.trim() || "https://api.twitch.tv/helix";
const AUTH = () => process.env.TWITCH_AUTH_URL?.trim() || "https://id.twitch.tv/oauth2/token";
const TIMEOUT_MS = 10_000;

const credentials = () => {
  const id = process.env.TWITCH_CLIENT_ID?.trim();
  const secret = process.env.TWITCH_CLIENT_SECRET?.trim();
  return id && secret ? { id, secret } : null;
};

export const twitchConfigured = () => credentials() != null;

// Token do app em memória (vale ~60 dias; renovado ao expirar ou num 401).
let cached: { token: string; expiresAt: number } | null = null;

async function appToken(force = false): Promise<string | null> {
  const cred = credentials();
  if (!cred) return null;
  if (!force && cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const res = await fetch(AUTH(), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: cred.id, client_secret: cred.secret, grant_type: "client_credentials" }),
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok)
    throw new Error(
      `Twitch recusou as credenciais (HTTP ${res.status}). Confira TWITCH_CLIENT_ID e TWITCH_CLIENT_SECRET.`,
    );
  const body = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) throw new Error("Twitch não devolveu o token.");
  cached = { token: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 };
  return cached.token;
}

type Params = Record<string, string | string[] | undefined>;

async function helix<T>(path: string, params: Params, revalidate: number | false): Promise<T[]> {
  const cred = credentials();
  if (!cred) return [];
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    for (const item of Array.isArray(v) ? v : v == null ? [] : [v]) qs.append(k, item);
  }
  const url = `${API()}/${path}?${qs}`;
  for (const retry of [false, true]) {
    const token = await appToken(retry);
    const res = await fetch(url, {
      headers: { "client-id": cred.id, authorization: `Bearer ${token}` },
      ...(revalidate === false ? { cache: "no-store" as const } : { next: { revalidate } }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 401 && !retry) continue;
    if (!res.ok) throw new Error(`Twitch respondeu HTTP ${res.status} em /${path}.`);
    return ((await res.json()) as { data?: T[] }).data ?? [];
  }
  return [];
}

const chunks = <T>(list: T[], size = 100) =>
  Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));

export interface TwitchUser {
  id: string;
  login: string;
  displayName: string;
  imageUrl: string | null;
}

export async function getTwitchUsers(logins: string[]): Promise<TwitchUser[]> {
  const unique = [...new Set(logins)];
  const pages = await Promise.all(
    chunks(unique).map((login) =>
      helix<{ id: string; login: string; display_name: string; profile_image_url?: string }>(
        "users",
        { login },
        86_400,
      ),
    ),
  );
  return pages.flat().map((u) => ({
    id: u.id,
    login: u.login.toLowerCase(),
    displayName: u.display_name,
    imageUrl: u.profile_image_url || null,
  }));
}

export interface TwitchStream {
  login: string;
  title: string;
  game: string | null;
  viewers: number;
  startedAt: string;
  thumbnailUrl: string | null;
}

/** Canais ao vivo agora (cache de 1 minuto). */
export async function getLiveStreams(logins: string[]): Promise<TwitchStream[]> {
  const unique = [...new Set(logins)];
  const pages = await Promise.all(
    chunks(unique).map((user_login) =>
      helix<{
        user_login: string;
        title: string;
        game_name?: string;
        viewer_count: number;
        started_at: string;
        thumbnail_url?: string;
        type: string;
      }>("streams", { user_login, type: "live", first: "100" }, 60),
    ),
  );
  return pages
    .flat()
    .filter((s) => s.type === "live")
    .map((s) => ({
      login: s.user_login.toLowerCase(),
      title: s.title,
      game: s.game_name || null,
      viewers: s.viewer_count,
      startedAt: s.started_at,
      thumbnailUrl: s.thumbnail_url?.replace("{width}", "640").replace("{height}", "360") || null,
    }));
}

export interface TwitchVideo {
  id: string;
  title: string;
  createdAt: string;
  durationSec: number;
  thumbnailUrl: string | null;
  /** archive = gravação automática; highlight = destaque (fica salvo). */
  type: "archive" | "highlight" | "upload";
}

/** Gravações e destaques recentes do canal (cache de 10 minutos). */
export async function getVideos(userId: string): Promise<TwitchVideo[]> {
  const list = await helix<{
    id: string;
    title: string;
    created_at: string;
    duration: string;
    thumbnail_url?: string;
    type: TwitchVideo["type"];
  }>("videos", { user_id: userId, first: "50", sort: "time" }, 600);
  return list.map((v) => ({
    id: v.id,
    title: v.title,
    createdAt: v.created_at,
    durationSec: parseTwitchDuration(v.duration),
    thumbnailUrl:
      v.thumbnail_url && !v.thumbnail_url.includes("_404/")
        ? v.thumbnail_url.replace("%{width}", "640").replace("%{height}", "360")
        : null,
    type: v.type,
  }));
}

export interface TwitchClip {
  id: string;
  title: string;
  createdAt: string;
  thumbnailUrl: string | null;
  creator: string | null;
  views: number;
  durationSec: number;
}

/** Clipes criados no canal dentro do período (sem cache). */
export async function getClips(broadcasterId: string, start: Date, end: Date): Promise<TwitchClip[]> {
  const list = await helix<{
    id: string;
    title: string;
    created_at: string;
    thumbnail_url?: string;
    creator_name?: string;
    view_count: number;
    duration: number;
  }>(
    "clips",
    { broadcaster_id: broadcasterId, started_at: start.toISOString(), ended_at: end.toISOString(), first: "100" },
    false,
  );
  return list.map((c) => ({
    id: c.id,
    title: c.title,
    createdAt: c.created_at,
    thumbnailUrl: c.thumbnail_url || null,
    creator: c.creator_name || null,
    views: c.view_count,
    durationSec: Math.round(c.duration),
  }));
}
