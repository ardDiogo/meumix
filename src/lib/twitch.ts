/**
 * Twitch: canal de cada jogador, players incorporáveis e clipes.
 * Os players da Twitch exigem `parent=<domínio da página>`; o domínio é
 * acrescentado no navegador por `withTwitchParent`.
 */
const LOGIN = /^[a-z0-9_]{3,25}$/;
const CLIP_ID = /^[A-Za-z0-9_-]{6,100}$/;
const RESERVED = new Set(["videos", "directory", "settings", "search", "downloads", "p", "jobs", "turbo"]);

/** Login do canal a partir de twitch.tv/<canal>, "@canal" ou só o nome. */
export function parseTwitchLogin(raw: string): string | null {
  let text = raw.trim();
  if (!text) return null;
  const url = text.match(/^(?:https?:\/\/)?(?:www\.|m\.)?twitch\.tv\/([^/?#\s]+)/i);
  if (url) text = url[1]!;
  else if (/[/.:\s]/.test(text)) return null;
  const login = text.replace(/^@/, "").toLowerCase();
  return LOGIN.test(login) && !RESERVED.has(login) ? login : null;
}

/** Código do clipe a partir de clips.twitch.tv/<id> ou twitch.tv/<canal>/clip/<id>. */
export function parseTwitchClip(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  let id: string | undefined;
  if (host === "clips.twitch.tv") id = url.pathname.split("/").filter(Boolean)[0];
  else if (/(^|\.)twitch\.tv$/.test(host)) id = url.pathname.match(/\/clip\/([^/?#]+)/i)?.[1];
  return id && id !== "embed" && CLIP_ID.test(id) ? id : null;
}

export const twitchChannelUrl = (login: string) => `https://www.twitch.tv/${login}`;
export const twitchClipUrl = (id: string) => `https://clips.twitch.tv/${encodeURIComponent(id)}`;
export const twitchClipEmbedUrl = (id: string) => `https://clips.twitch.tv/embed?clip=${encodeURIComponent(id)}`;
export const twitchVideoUrl = (id: string) => `https://www.twitch.tv/videos/${encodeURIComponent(id)}`;

/** Player da live (canal) ou de uma gravação (vídeo). */
export function twitchPlayerUrl(src: { channel: string } | { video: string }, autoplay = false) {
  const q = "channel" in src ? `channel=${encodeURIComponent(src.channel)}` : `video=v${encodeURIComponent(src.video)}`;
  return `https://player.twitch.tv/?${q}&autoplay=${autoplay}`;
}

export const isTwitchEmbed = (url: string) => /^https:\/\/(player|clips)\.twitch\.tv\//.test(url);

/** Acrescenta o domínio da página, exigido pelos players da Twitch. */
export function withTwitchParent(url: string, hostname: string) {
  if (!isTwitchEmbed(url)) return url;
  return `${url}${url.includes("?") ? "&" : "?"}parent=${encodeURIComponent(hostname)}`;
}

/** "3h2m10s" → segundos (formato de duração da API da Twitch). */
export function parseTwitchDuration(text: string): number {
  const m = text.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!m) return 0;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

/**
 * Janela de um mix para achar lives, gravações e clipes: das 12h do dia do mix
 * até as 6h do dia seguinte (horário de Brasília). `scheduledAt` é o dia às 20h.
 */
export function mixBroadcastWindow(scheduledAt: string) {
  const day = scheduledAt.slice(0, 10);
  const start = new Date(`${day}T15:00:00Z`);
  const end = new Date(start.getTime() + 18 * 3600_000);
  return { start, end };
}
