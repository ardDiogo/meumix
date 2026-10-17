/**
 * Leitura de prints da Gamers Club (docs/especificacao-tecnica.md, 4.12).
 * Funções puras: saneamento, unificação de nicks, alinhamento dos times e
 * agregação dos mapas. A chamada à IA fica em `src/app/(app)/admin/finalizar/ocr.ts`.
 */

export interface OcrPlayer {
  nick: string;
  k: number;
  a: number;
  d: number;
  diff: number;
  adr: number | null;
  kdr: number;
  kast: number | null;
  s: number;
  fa: number;
  mk: number;
  fk: number;
  rp: number;
  drop: number;
}

export interface OcrTeam {
  name: string | null;
  score: number | null;
  players: OcrPlayer[];
}

export interface OcrMap {
  mapName: string | null;
  teams: [OcrTeam, OcrTeam];
}

/* ------------------------------- Saneamento ------------------------------- */

const int = (v: unknown, min = 0) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(n, min) : 0;
};
const optNum = (v: unknown, max: number) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(",", ".").replace("%", ""));
  return Number.isFinite(n) ? Math.min(Math.max(n, 0), max) : null;
};

/** Zera negativos impossíveis, recalcula DIFF = K − D e KDR = K / max(D, 1). */
export function sanitizePlayer(raw: Record<string, unknown>): OcrPlayer {
  const k = int(raw.k);
  const d = int(raw.d);
  return {
    nick: String(raw.nick ?? "").trim(),
    k,
    a: int(raw.a),
    d,
    diff: k - d,
    adr: optNum(raw.adr, 500),
    kdr: Math.round((k / Math.max(d, 1)) * 100) / 100,
    kast: optNum(raw.kast, 100),
    s: int(raw.s),
    fa: int(raw.fa),
    mk: int(raw.mk),
    fk: int(raw.fk),
    // RP pode ser negativo (pontos de ranking perdidos).
    rp: int(raw.rp, -1000),
    drop: int(raw.drop),
  };
}

export function sanitizeMap(raw: unknown): OcrMap {
  const r = (raw ?? {}) as { map_name?: unknown; teams?: unknown[] };
  const teams = (Array.isArray(r.teams) ? r.teams : []).slice(0, 2).map((t) => {
    const team = (t ?? {}) as { name?: unknown; score?: unknown; players?: unknown[] };
    return {
      name: team.name ? String(team.name) : null,
      score: team.score === null || team.score === undefined || team.score === "" ? null : int(team.score),
      players: (Array.isArray(team.players) ? team.players : [])
        .map((p) => sanitizePlayer((p ?? {}) as Record<string, unknown>))
        .filter((p) => p.nick),
    };
  });
  while (teams.length < 2) teams.push({ name: null, score: null, players: [] });
  return { mapName: r.map_name ? String(r.map_name) : null, teams: [teams[0]!, teams[1]!] };
}

/* ------------------------------ Nicks parecidos ---------------------------- */

const LEET: Record<string, string> = {
  "0": "o",
  "1": "l",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "8": "b",
  "@": "a",
  $: "s",
  "|": "l",
  // "I" maiúsculo e "l" se confundem na leitura de prints.
  i: "l",
};

/**
 * Remove sites e canais do nick, comuns na GC: "Cypher_exe - ardboost.com.br" → "Cypher_exe",
 * "twitch.tv/paiked1" → "paiked1". Se sobrar vazio, mantém o original.
 */
export function stripSites(nick: string) {
  const out = nick
    .replace(
      /\b(?:www\.)?(?:twitch\.tv|youtube\.com|kick\.com|instagram\.com|tiktok\.com|x\.com)\/@?([\w.-]+)/gi,
      " $1 ",
    )
    .replace(/\b[\w-]+(?:\.[a-z]{2,6})+(?:\/\S*)?/gi, " ")
    .replace(/\s*[-–|]+\s*$/g, "")
    .replace(/^\s*[-–|]+\s*/g, "")
    .trim();
  return out || nick;
}

/**
 * Minúsculas, sem acento, sem tag de clã ([TAG], (TAG), {TAG}), com troca de
 * "leet" e de letras parecidas (0→o, 1/i/|→l…), só letras e números.
 */
export function normalizeNick(nick: string) {
  return stripSites(nick)
    .replace(/[[({][^\])}]*[\])}]/g, " ")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[0-9@$|i]/g, (c) => LEET[c] ?? c)
    .replace(/[^a-z0-9]/g, "");
}

function levenshtein(a: string, b: string) {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]!;
      prev[j] = Math.min(prev[j]! + 1, prev[j - 1]! + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length]!;
}

/** Semelhança de 0 a 1 entre dois nicks (após normalização). */
export function nickSimilarity(a: string, b: string) {
  const x = normalizeNick(a);
  const y = normalizeNick(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const shorter = x.length <= y.length ? x : y;
  const longer = x.length <= y.length ? y : x;
  // Prefixo/clã: "kraken" dentro de "tagkraken".
  if (shorter.length >= 4 && longer.includes(shorter)) return Math.max(0.9, shorter.length / longer.length);
  return 1 - levenshtein(x, y) / Math.max(x.length, y.length);
}

/** Limiar para unificar o mesmo jogador entre prints diferentes. */
export const UNIFY_THRESHOLD = 0.8;
/** Limiar para vincular um nick do print a um perfil cadastrado (≥ 70%). */
export const PROFILE_MATCH_THRESHOLD = 0.7;

/* --------------------------- Junção dos mapas ------------------------------ */

export interface MergedPlayer {
  /** Nick canônico (primeira grafia vista). */
  name: string;
  aliases: string[];
  side: "X" | "Y";
  k: number;
  a: number;
  d: number;
  fk: number;
  rp: number;
  s: number;
  fa: number;
  mk: number;
  drop: number;
  adr: number | null;
  kast: number | null;
  maps: number;
}

export interface MergedResult {
  maps: { mapName: string | null; scoreX: number | null; scoreY: number | null }[];
  players: MergedPlayer[];
  warnings: string[];
}

/**
 * Junta os prints de uma série:
 * - unifica nicks parecidos entre prints, nunca dois nicks do mesmo print;
 * - reconhece o mesmo time entre mapas por 3+ jogadores em comum (o nome do time pode mudar);
 * - soma K/A/D/FK/RP e faz ADR e KAST ponderados pelos rounds de cada mapa.
 */
export function mergeMaps(maps: OcrMap[]): MergedResult {
  const warnings: string[] = [];
  const canon: { name: string; aliases: Set<string> }[] = [];

  const canonicalOf = (nick: string, taken: Set<number>) => {
    let best = -1;
    let bestScore = 0;
    canon.forEach((c, i) => {
      if (taken.has(i)) return;
      const score = Math.max(...[...c.aliases].map((alias) => nickSimilarity(alias, nick)));
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    });
    if (best >= 0 && bestScore >= UNIFY_THRESHOLD) {
      canon[best]!.aliases.add(nick);
      return best;
    }
    canon.push({ name: nick, aliases: new Set([nick]) });
    return canon.length - 1;
  };

  // 1) Nicks → índices canônicos (por print, sem repetir índice no mesmo print).
  const resolved = maps.map((m) => {
    const taken = new Set<number>();
    return m.teams.map((t) =>
      t.players.map((p) => {
        const idx = canonicalOf(p.nick, taken);
        taken.add(idx);
        return { idx, p };
      }),
    );
  });

  // 2) Orientação dos times: o lado X é o time 0 do primeiro print.
  const sideX = new Set<number>((resolved[0]?.[0] ?? []).map((r) => r.idx));
  const sideY = new Set<number>((resolved[0]?.[1] ?? []).map((r) => r.idx));
  const flipped = resolved.map((teams, i) => {
    if (i === 0) return false;
    const common = (team: { idx: number }[], side: Set<number>) => team.filter((r) => side.has(r.idx)).length;
    const keep = common(teams[0]!, sideX) + common(teams[1]!, sideY);
    const swap = common(teams[0]!, sideY) + common(teams[1]!, sideX);
    if (Math.max(keep, swap) < 3)
      warnings.push(`Mapa ${i + 1}: poucos jogadores em comum com o mapa 1; confira os times.`);
    return swap > keep;
  });

  // Colunas que a IA deixou em branco num mapa distorcem a média: avisa para conferir.
  maps.forEach((m, i) => {
    const players = [...m.teams[0].players, ...m.teams[1].players];
    const noAdr = players.filter((p) => p.adr == null).length;
    const noKast = players.filter((p) => p.kast == null).length;
    const label = m.mapName ? `${m.mapName} (mapa ${i + 1})` : `Mapa ${i + 1}`;
    if (noAdr) warnings.push(`${label}: ADR não lido para ${noAdr} jogador(es); confira a coluna ADR.`);
    if (noKast) warnings.push(`${label}: KAST não lido para ${noKast} jogador(es); confira a coluna KAST.`);
  });

  // 3) Agregação.
  const acc = new Map<
    number,
    MergedPlayer & { rounds: number; adrSum: number; adrRounds: number; kastSum: number; kastRounds: number }
  >();
  const mapResults: MergedResult["maps"] = [];
  resolved.forEach((teams, i) => {
    const m = maps[i]!;
    const [tx, ty] = flipped[i] ? [m.teams[1], m.teams[0]] : [m.teams[0], m.teams[1]];
    mapResults.push({ mapName: m.mapName, scoreX: tx.score, scoreY: ty.score });
    const rounds = (tx.score ?? 0) + (ty.score ?? 0) || 1;
    const ordered = flipped[i] ? [teams[1]!, teams[0]!] : [teams[0]!, teams[1]!];
    ordered.forEach((team, t) => {
      for (const { idx, p } of team) {
        const side = t === 0 ? "X" : "Y";
        const cur =
          acc.get(idx) ??
          ({
            name: canon[idx]!.name,
            aliases: [],
            side,
            k: 0,
            a: 0,
            d: 0,
            fk: 0,
            rp: 0,
            s: 0,
            fa: 0,
            mk: 0,
            drop: 0,
            adr: null,
            kast: null,
            maps: 0,
            rounds: 0,
            adrSum: 0,
            adrRounds: 0,
            kastSum: 0,
            kastRounds: 0,
          } as const);
        const next = { ...cur };
        if (next.maps > 0 && next.side !== side) warnings.push(`${next.name} aparece nos dois times; confira.`);
        next.k += p.k;
        next.a += p.a;
        next.d += p.d;
        next.fk += p.fk;
        next.rp += p.rp;
        next.s += p.s;
        next.fa += p.fa;
        next.mk += p.mk;
        next.drop += p.drop;
        next.maps += 1;
        if (p.adr != null) {
          next.adrSum += p.adr * rounds;
          next.adrRounds += rounds;
        }
        if (p.kast != null) {
          next.kastSum += p.kast * rounds;
          next.kastRounds += rounds;
        }
        acc.set(idx, next);
      }
    });
  });

  const players = [...acc.entries()].map(([idx, p]) => ({
    name: p.name,
    aliases: [...canon[idx]!.aliases],
    side: p.side,
    k: p.k,
    a: p.a,
    d: p.d,
    fk: p.fk,
    rp: p.rp,
    s: p.s,
    fa: p.fa,
    mk: p.mk,
    drop: p.drop,
    adr: p.adrRounds ? Math.round((p.adrSum / p.adrRounds) * 10) / 10 : null,
    kast: p.kastRounds ? Math.round((p.kastSum / p.kastRounds) * 10) / 10 : null,
    maps: p.maps,
  }));
  return { maps: mapResults, players, warnings };
}

/* ------------------------- Vínculo com os perfis -------------------------- */

/**
 * Vincula jogadores do print a perfis (semelhança ≥ 70%), sem repetir perfil,
 * priorizando as maiores semelhanças. Devolve o índice do perfil ou -1.
 */
export function matchProfiles(players: { aliases: string[] }[], profiles: { name: string }[]) {
  const pairs: { p: number; q: number; score: number }[] = [];
  players.forEach((pl, p) =>
    profiles.forEach((pr, q) => {
      const score = Math.max(...pl.aliases.map((a) => nickSimilarity(a, pr.name)));
      if (score >= PROFILE_MATCH_THRESHOLD) pairs.push({ p, q, score });
    }),
  );
  pairs.sort((x, y) => y.score - x.score);
  const result = players.map(() => -1);
  const usedProfiles = new Set<number>();
  for (const { p, q } of pairs) {
    if (result[p] !== -1 || usedProfiles.has(q)) continue;
    result[p] = q;
    usedProfiles.add(q);
  }
  return result;
}

/** Converte o nome do mapa lido no print para o id cadastrado (ex.: "Mirage" → "de_mirage"). */
export function mapIdFromName(name: string | null, maps: { id: string; name: string; shortName?: string | null }[]) {
  if (!name) return null;
  const n = normalizeNick(name.replace(/^de_/i, ""));
  if (!n) return null;
  return (
    maps.find(
      (m) =>
        normalizeNick(m.name) === n ||
        normalizeNick(m.id.replace(/^de_/, "")) === n ||
        (!!m.shortName && normalizeNick(m.shortName) === n),
    )?.id ?? null
  );
}
