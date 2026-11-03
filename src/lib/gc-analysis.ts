/**
 * Análise da partida com os dados importados da GC (tabela match_gc_maps):
 * soma os mapas do mix por jogador e lê o placar round a round. Funções puras.
 */
import type { GcMapStored } from "./gc-api";

type StoredPlayer = GcMapStored["players"][number];

export interface GcLine {
  /** Jogador do MeuMix, ou "gc:<id>" para convidado. */
  key: string;
  userId: string | null;
  nick: string;
  team: "A" | "B";
  maps: number;
  rounds: number;
  rating: number | null;
  /** Swing médio por round (0,021 = +2,1%). */
  swing: number | null;
  k: number;
  a: number;
  d: number;
  adr: number | null;
  kast: number | null;
  hs: number;
  /** % das kills com headshot. */
  hsRate: number | null;
  fa: number;
  /** Rounds com 1, 2, 3, 4 e 5 kills. */
  multi: number[];
  entries: { duels: number; won: number; lost: number };
  trades: { made: number; traded: number; avgTime: number | null };
  clutch: {
    situations: number;
    won: number;
    v1Won: number;
    v1Total: number;
    vnWon: number;
    vnTotal: number;
    biggest: number | null;
  };
  utility: { damage: number; flashed: number; grenades: number };
  aim: { accuracy: number | null; headAccuracy: number | null; mainWeapon: string | null };
}

const roundsOf = (m: GcMapStored) => m.rounds.length || m.scoreA + m.scoreB;

/** Média ponderada (ignora valores ausentes). */
function weighted(parts: { v: number | null | undefined; w: number }[]) {
  const ok = parts.filter((p) => p.v != null && Number.isFinite(p.v) && p.w > 0);
  const w = ok.reduce((s, p) => s + p.w, 0);
  return w ? ok.reduce((s, p) => s + p.v! * p.w, 0) / w : null;
}

/** Uma linha por jogador, somando os mapas escolhidos. */
export function aggregateGc(maps: GcMapStored[]): GcLine[] {
  const groups = new Map<string, { p: StoredPlayer; rounds: number }[]>();
  for (const m of maps) {
    const rounds = roundsOf(m);
    for (const p of m.players) {
      const key = p.userId ?? `gc:${p.gcId}`;
      groups.set(key, [...(groups.get(key) ?? []), { p, rounds }]);
    }
  }
  return [...groups].map(([key, list]) => {
    const sum = (f: (p: StoredPlayer) => number) => list.reduce((s, x) => s + (f(x.p) || 0), 0);
    const byRounds = (f: (p: StoredPlayer) => number | null | undefined) =>
      weighted(list.map((x) => ({ v: f(x.p), w: x.rounds })));
    const last = list.at(-1)!.p;
    const k = sum((p) => p.k);
    const hs = sum((p) => p.hs);
    const made = sum((p) => p.trades.made);
    const biggest = Math.max(...list.map((x) => x.p.clutch.biggest ?? 0));
    // Arma principal: a que mais aparece entre os mapas.
    const weapons = list.map((x) => x.p.aim.mainWeapon).filter((w): w is string => !!w);
    const mainWeapon =
      weapons.sort((a, b) => weapons.filter((w) => w === b).length - weapons.filter((w) => w === a).length)[0] ?? null;
    return {
      key,
      userId: last.userId,
      nick: last.nick,
      team: last.team,
      maps: list.length,
      rounds: list.reduce((s, x) => s + x.rounds, 0),
      rating: byRounds((p) => p.rating),
      swing: byRounds((p) => p.swing),
      k,
      a: sum((p) => p.a),
      d: sum((p) => p.d),
      adr: byRounds((p) => p.adr),
      kast: byRounds((p) => p.kast),
      hs,
      hsRate: k ? (hs / k) * 100 : null,
      fa: sum((p) => p.fa),
      multi: [0, 1, 2, 3, 4].map((i) => sum((p) => p.multi?.[i] ?? 0)),
      entries: {
        duels: sum((p) => p.entries.duels),
        won: sum((p) => p.entries.won),
        lost: sum((p) => p.entries.lost),
      },
      trades: {
        made,
        traded: sum((p) => p.trades.traded),
        avgTime: weighted(list.map((x) => ({ v: x.p.trades.avgTime, w: x.p.trades.made }))),
      },
      clutch: {
        situations: sum((p) => p.clutch.situations),
        won: sum((p) => p.clutch.won),
        v1Won: sum((p) => p.clutch.v1Won),
        v1Total: sum((p) => p.clutch.v1Total),
        vnWon: sum((p) => p.clutch.vnWon),
        vnTotal: sum((p) => p.clutch.vnTotal),
        biggest: biggest > 0 ? biggest : null,
      },
      utility: {
        damage: sum((p) => p.utility.damage),
        flashed: sum((p) => p.utility.flashed),
        grenades: sum((p) => p.utility.grenades),
      },
      aim: {
        accuracy: byRounds((p) => p.aim.accuracy),
        headAccuracy: byRounds((p) => p.aim.headAccuracy),
        mainWeapon,
      },
    };
  });
}

export interface RoundStory {
  /** Placar depois de cada round (lado do mix). */
  scores: { a: number; b: number }[];
  winner: "A" | "B" | null;
  /** Maior desvantagem que o vencedor tirou (ex.: estava 2×10 → 8). */
  comeback: { from: { a: number; b: number }; deficit: number } | null;
  /** Maior sequência de rounds seguidos de um time. */
  streak: { team: "A" | "B"; length: number; from: number } | null;
}

/** Conta a história do mapa pelos rounds: placar, virada e maior sequência. */
export function roundStory(m: GcMapStored): RoundStory {
  let a = 0;
  let b = 0;
  const scores = m.rounds.map((r) => {
    if (r.w === "A") a++;
    else b++;
    return { a, b };
  });
  const winner = a === b ? null : a > b ? "A" : "B";
  let comeback: RoundStory["comeback"] = null;
  if (winner) {
    for (const s of scores) {
      const deficit = winner === "A" ? s.b - s.a : s.a - s.b;
      if (deficit > (comeback?.deficit ?? 0)) comeback = { from: s, deficit };
    }
  }
  let streak: RoundStory["streak"] = null;
  let run = 0;
  m.rounds.forEach((r, i) => {
    run = i > 0 && m.rounds[i - 1]!.w === r.w ? run + 1 : 1;
    if (run > (streak?.length ?? 0)) streak = { team: r.w, length: run, from: i - run + 2 };
  });
  return { scores, winner, comeback: comeback && comeback.deficit >= 3 ? comeback : null, streak };
}

export type GcHighlightKey = "entry" | "trader" | "clutch" | "flash" | "nade" | "aim";

export interface GcHighlight {
  key: GcHighlightKey;
  line: GcLine;
}

/** Mínimo de kills para disputar a melhor mira (poucas kills distorcem a precisão). */
export const AIM_MIN_KILLS = 10;

/**
 * Destaques com os dados da GC: melhor entry, melhor trader, clutchzeiro,
 * quem mais cegou inimigos, maior dano com granada e melhor mira. Fica de
 * fora o destaque em que ninguém pontuou.
 */
export function gcHighlights(lines: GcLine[]): GcHighlight[] {
  const best = (score: (l: GcLine) => number, tie: (l: GcLine) => number = () => 0, pool = lines) =>
    pool.reduce<GcLine | null>((top, l) => {
      if (top == null) return l;
      const d = score(l) - score(top);
      return d > 0 || (d === 0 && tie(l) > tie(top)) ? l : top;
    }, null);
  const rate = (won: number, total: number) => (total ? won / total : 0);
  const shooters = lines.filter((l) => l.k >= AIM_MIN_KILLS && l.aim.accuracy != null);
  const picks: [GcHighlightKey, GcLine | null, (l: GcLine) => number][] = [
    [
      "entry",
      best(
        (l) => l.entries.won,
        (l) => rate(l.entries.won, l.entries.duels),
      ),
      (l) => l.entries.won,
    ],
    [
      "trader",
      best(
        (l) => l.trades.made,
        (l) => -(l.trades.avgTime ?? 99),
      ),
      (l) => l.trades.made,
    ],
    [
      "clutch",
      best(
        (l) => l.clutch.won,
        (l) => l.clutch.biggest ?? 0,
      ),
      (l) => l.clutch.won,
    ],
    [
      "flash",
      best(
        (l) => l.utility.flashed,
        (l) => l.fa,
      ),
      (l) => l.utility.flashed,
    ],
    [
      "nade",
      best(
        (l) => l.utility.damage,
        (l) => -l.utility.grenades,
      ),
      (l) => l.utility.damage,
    ],
    [
      "aim",
      best(
        (l) => l.aim.accuracy ?? 0,
        (l) => l.hsRate ?? 0,
        shooters,
      ),
      (l) => l.aim.accuracy ?? 0,
    ],
  ];
  return picks.flatMap(([key, line, score]) => (line && score(line) > 0 ? [{ key, line }] : []));
}

const pctText = (n: number | null) => `${Math.round(n ?? 0)}%`;
const sec = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}s`;

/** Título e texto de cada destaque da GC (página do mix e imagem compartilhada). */
export const GC_HIGHLIGHT_TEXT: Record<GcHighlightKey, { title: string; detail: (l: GcLine) => string }> = {
  entry: {
    title: "Melhor entry",
    detail: (l) =>
      `${l.entries.won} de ${l.entries.duels} aberturas (${pctText((l.entries.won / l.entries.duels) * 100)})`,
  },
  trader: {
    title: "Melhor trader",
    detail: (l) => `${l.trades.made} trades${l.trades.avgTime != null ? ` · ${sec(l.trades.avgTime)}` : ""}`,
  },
  clutch: {
    title: "Clutchzeiro",
    detail: (l) =>
      `${l.clutch.won} ${l.clutch.won === 1 ? "clutch" : "clutches"}${l.clutch.biggest ? ` · maior 1v${l.clutch.biggest}` : ""}`,
  },
  flash: {
    title: "Mais inimigos cegados",
    detail: (l) => `${l.utility.flashed} cegados${l.fa ? ` · ${l.fa} flash assists` : ""}`,
  },
  nade: { title: "Dano com granada", detail: (l) => `${l.utility.damage} de dano · ${l.utility.grenades} granadas` },
  aim: { title: "Melhor mira", detail: (l) => `${pctText(l.aim.accuracy)} de precisão · ${pctText(l.hsRate)} HS` },
};

/**
 * Ordem dos destaques: MVP e os demais, depois os da GC; mais mortes
 * (penúltimo) e lanterna (último) sempre no fim.
 */
export function orderHighlights<S extends { key: string }, G>(stats: S[], gc: G[]) {
  const last = ["deaths", "worst"];
  return [
    ...stats.filter((h) => !last.includes(h.key)).map((h) => ({ stat: h })),
    ...gc.map((h) => ({ gc: h })),
    ...last.flatMap((k) => stats.filter((h) => h.key === k).map((h) => ({ stat: h }))),
  ] as ({ stat: S; gc?: undefined } | { gc: G; stat?: undefined })[];
}

/** Divisões do placar: meio tempo no 12 e trocas da prorrogação (MR3) a partir do 24. */
export const roundBreakAfter = (round: number) => round === 12 || (round >= 24 && (round - 24) % 3 === 0);

/** Placar do ponto de vista de quem venceu: "2×10", "16×14". */
export const winnerFirst = (s: { a: number; b: number }, w: "A" | "B") =>
  w === "A" ? `${s.a}×${s.b}` : `${s.b}×${s.a}`;
