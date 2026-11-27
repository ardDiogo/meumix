/**
 * Leitura dos clipes de uma partida no Allstar pela mesma consulta GraphQL
 * que a página "Full match" usa (MatchPage). Não é uma API oficial: se o
 * Allstar mudar ou exigir login, a importação falha e o envio manual continua.
 * `ALLSTAR_API_URL` permite trocar o endereço (testes).
 */
import { kindFromTitle } from "@/lib/clip-meta";

const DEFAULT_URL = "https://api.prod.allstar.dev/graphql";
const TIMEOUT_MS = 15_000;

const QUERY = `query MatchPage($matchId: ID!, $playerGameId: String!, $momentsLimit: Int) {
  match(id: $matchId, playerGameId: $playerGameId) {
    title
    matchPlayedAt
    moments(limit: $momentsLimit) {
      id
      title
      clipTags { key value }
      clip {
        id
        status
        shareId
        title
        thumbnailUrl(style: STANDARD)
        url(orientation: LANDSCAPE)
        duration
      }
    }
  }
}`;

export interface AllstarMoment {
  momentId: string;
  shareId: string;
  title: string;
  status: string | null;
  thumbnailUrl: string | null;
  videoUrl: string | null;
  tags: string[];
}

export type AllstarMatchResult =
  | { ok: true; title: string | null; playedAt: string | null; moments: AllstarMoment[] }
  | { ok: false; message: string; auth?: boolean };

/** allstar.gg/match/<id>?playerGameId=… → { matchId, playerGameId } */
export function parseAllstarMatchUrl(raw: string): { matchId: string; playerGameId: string | null } | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (!/(^|\.)allstar\.gg$/i.test(url.hostname)) return null;
  const matchId = url.pathname.match(/^\/match\/([A-Za-z0-9_=-]{8,120})/)?.[1];
  if (!matchId) return null;
  const player = url.searchParams.get("playerGameId");
  return { matchId, playerGameId: player && /^\d{5,20}$/.test(player) ? player : null };
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const httpsUrl = (v: unknown) => {
  const s = str(v);
  return s && /^https:\/\//i.test(s) ? s : null;
};

/** Momentos (com clipe) de um jogador numa partida do Allstar. */
export async function fetchAllstarMatch(matchId: string, playerGameId: string): Promise<AllstarMatchResult> {
  let res: Response;
  try {
    res = await fetch(process.env.ALLSTAR_API_URL?.trim() || DEFAULT_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "user-agent": "MeuMix/1.0 (+https://meumix.vercel.app)",
      },
      body: JSON.stringify({
        operationName: "MatchPage",
        query: QUERY,
        variables: { matchId, playerGameId, momentsLimit: 50 },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    const timeout = e instanceof Error && e.name === "TimeoutError";
    return {
      ok: false,
      message: timeout ? "O Allstar demorou demais para responder." : "Não foi possível falar com o Allstar.",
    };
  }
  if (res.status === 401 || res.status === 403) {
    return { ok: false, auth: true, message: `O Allstar recusou o acesso (HTTP ${res.status}).` };
  }
  let body: { data?: { match?: unknown }; errors?: { message?: string; extensions?: { code?: string } }[] };
  try {
    body = await res.json();
  } catch {
    return { ok: false, message: `Resposta inesperada do Allstar (HTTP ${res.status}).` };
  }
  const match = body.data?.match as
    { title?: unknown; matchPlayedAt?: unknown; moments?: unknown[] } | null | undefined;
  if (!match) {
    const err = body.errors?.[0];
    const auth = /auth|unauthor|forbidden|login/i.test(`${err?.message} ${err?.extensions?.code}`);
    return {
      ok: false,
      auth,
      message: err?.message ? `Allstar: ${err.message}` : "Partida não encontrada no Allstar.",
    };
  }
  const moments: AllstarMoment[] = [];
  for (const m of Array.isArray(match.moments) ? match.moments : []) {
    const mo = (m ?? {}) as { id?: unknown; title?: unknown; clipTags?: unknown; clip?: unknown };
    const clip = (mo.clip ?? null) as {
      status?: unknown;
      shareId?: unknown;
      title?: unknown;
      thumbnailUrl?: unknown;
      url?: unknown;
    } | null;
    const shareId = str(clip?.shareId);
    if (!clip || !shareId || !/^[A-Za-z0-9_-]{6,64}$/.test(shareId)) continue;
    const tags = (Array.isArray(mo.clipTags) ? mo.clipTags : [])
      .map((t) => str((t as { value?: unknown })?.value) ?? str((t as { key?: unknown })?.key))
      .filter((t): t is string => !!t);
    moments.push({
      momentId: str(mo.id) ?? shareId,
      shareId,
      title: (str(clip.title) ?? str(mo.title) ?? "Clipe").slice(0, 80),
      status: str(clip.status),
      thumbnailUrl: httpsUrl(clip.thumbnailUrl),
      videoUrl: httpsUrl(clip.url),
      tags,
    });
  }
  return { ok: true, title: str(match.title), playedAt: str(match.matchPlayedAt), moments };
}

/** Tipo do clipe pelo título/etiquetas do Allstar ("Ace", "3K", "1V2 Clutch"…). */
export const clipKindFromAllstar = kindFromTitle;

/**
 * Miniatura de um clipe enviado pelo link. Melhor esforço, em ordem:
 * 1) a API GraphQL (a mesma da importação por partida), com o clipe pelo shareId;
 * 2) a imagem de prévia (og:image) da página pública e do player do clipe.
 * Devolve também o motivo da falha, para o log do admin mostrar o que aconteceu.
 */
export async function fetchAllstarThumbnailInfo(
  shareId: string,
): Promise<{ url: string | null; video: string | null; reason: string | null }> {
  const reasons: string[] = [];
  const ua = { "user-agent": "MeuMix/1.0 (+https://meumix.vercel.app)" };
  // 1) GraphQL: o nome do campo não é documentado; tenta as formas mais prováveis.
  const queries = [
    `query Clip($id: String!) { clip(shareId: $id) { thumbnailUrl(style: STANDARD) url(orientation: LANDSCAPE) } }`,
    `query Clip($id: String!) { clip(id: $id) { thumbnailUrl(style: STANDARD) url(orientation: LANDSCAPE) } }`,
  ];
  for (const query of queries) {
    try {
      const res = await fetch(process.env.ALLSTAR_API_URL?.trim() || DEFAULT_URL, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json", ...ua },
        body: JSON.stringify({ operationName: "Clip", query, variables: { id: shareId } }),
        cache: "no-store",
        signal: AbortSignal.timeout(8_000),
      });
      const body = (await res.json().catch(() => null)) as {
        data?: { clip?: { thumbnailUrl?: unknown; url?: unknown } | null };
        errors?: { message?: string }[];
      } | null;
      const thumb = httpsUrl(body?.data?.clip?.thumbnailUrl);
      if (thumb) return { url: thumb, video: httpsUrl(body?.data?.clip?.url), reason: null };
      reasons.push(`api: ${body?.errors?.[0]?.message?.slice(0, 80) ?? `HTTP ${res.status}`}`);
    } catch (e) {
      reasons.push(`api: ${e instanceof Error ? e.name : "falhou"}`);
    }
  }
  // 2) Páginas públicas: a imagem de prévia.
  for (const page of [
    `https://allstar.gg/clip/${encodeURIComponent(shareId)}`,
    `https://allstar.gg/iframe?clip=${encodeURIComponent(shareId)}`,
  ]) {
    try {
      const res = await fetch(page, {
        headers: { ...ua, accept: "text/html" },
        cache: "no-store",
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) {
        reasons.push(`página: HTTP ${res.status}`);
        continue;
      }
      const html = (await res.text()).slice(0, 400_000);
      const tag =
        html.match(/<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]*>/i)?.[0] ??
        html.match(/<meta[^>]+name=["']twitter:image["'][^>]*>/i)?.[0];
      const url = httpsUrl(tag?.match(/content=["']([^"']+)["']/i)?.[1]?.replace(/&amp;/g, "&"));
      if (url) return { url, video: null, reason: null };
      reasons.push("página: sem imagem de prévia");
    } catch (e) {
      reasons.push(`página: ${e instanceof Error ? e.name : "falhou"}`);
    }
  }
  return { url: null, video: null, reason: reasons.join(" | ") };
}

export async function fetchAllstarThumbnail(shareId: string): Promise<string | null> {
  return (await fetchAllstarThumbnailInfo(shareId)).url;
}
