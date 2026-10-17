/**
 * Leitura dos clipes de uma partida no Allstar pela mesma consulta GraphQL
 * que a página "Full match" usa (MatchPage). Não é uma API oficial: se o
 * Allstar mudar ou exigir login, a importação falha e o envio manual continua.
 * `ALLSTAR_API_URL` permite trocar o endereço (testes).
 */
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
export function clipKindFromAllstar(title: string, tags: string[] = []): "ace" | "clutch" | "multikill" | "clip" {
  const text = `${title} ${tags.join(" ")}`;
  if (/\bace\b|\b5k\b/i.test(text)) return "ace";
  if (/clutch|\b1v[1-5]\b/i.test(text)) return "clutch";
  if (/\b[2-4]k\b|multi/i.test(text)) return "multikill";
  return "clip";
}
