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
