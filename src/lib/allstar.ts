/**
 * Allstar.gg: clipes (aces, clutches…) gerados das partidas, inclusive as da GC.
 * O jogador cola o link do clipe ou do perfil; o vídeo toca no site pelo
 * player incorporável do Allstar, com "Abrir no Allstar" de reserva.
 */
const CLIP_ID = /^[A-Za-z0-9_-]{6,64}$/;
const HANDLE = /^[A-Za-z0-9_.-]{2,40}$/;

/** Código do clipe a partir de allstar.gg/clip/<id> ou allstar.gg/clip?clip=<id>. */
export function parseAllstarClip(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (!/(^|\.)allstar\.gg$/i.test(url.hostname)) return null;
  const fromQuery = url.searchParams.get("clip");
  const fromPath = url.pathname.match(/^\/(?:clip|iframe)\/([^/?#]+)/i)?.[1];
  const id = fromPath ?? fromQuery;
  return id && CLIP_ID.test(id) ? id : null;
}

/** Link limpo do perfil (allstar.gg/u/<nick>). */
export function parseAllstarProfile(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (!/(^|\.)allstar\.gg$/i.test(url.hostname)) return null;
  const handle = url.pathname.match(/^\/u\/([^/?#]+)/i)?.[1];
  return handle && HANDLE.test(handle) ? `https://allstar.gg/u/${handle}` : null;
}

export const allstarClipUrl = (id: string) => `https://allstar.gg/clip/${encodeURIComponent(id)}`;
export const allstarEmbedUrl = (id: string) => `https://allstar.gg/iframe?clip=${encodeURIComponent(id)}`;
