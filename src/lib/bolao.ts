/**
 * Regras do bolão do mix (sem dinheiro: só pontos). Funções puras, testadas em
 * `bolao.test.ts`. Os pontos são calculados na hora a partir do resultado
 * oficial: corrigir ou excluir o mix corrige o bolão sozinho.
 */

export const BOLAO_POINTS = {
  /** Acertar o time vencedor. */
  winner: 3,
  /** Acertar também o placar de mapas (só vale com o vencedor certo). */
  score: 2,
  mvp: 3,
  lanterna: 2,
} as const;

export const BOLAO_MAX = BOLAO_POINTS.winner + BOLAO_POINTS.score + BOLAO_POINTS.mvp + BOLAO_POINTS.lanterna;

export interface Prediction {
  userId: string;
  /** Capitão do time que vai vencer. */
  winnerCaptain: string;
  mapsWon: number;
  mapsLost: number;
  mvpId: string | null;
  lanternaId: string | null;
}

export interface MixOutcome {
  /** Capitão do time vencedor (null: empate ou capitão fora do resultado). */
  winnerCaptain: string | null;
  mapsWon: number;
  mapsLost: number;
  mvpId: string | null;
  lanternaId: string | null;
}

export interface PredictionScore {
  points: number;
  winner: boolean;
  score: boolean;
  mvp: boolean;
  lanterna: boolean;
}

/** Placares possíveis (vencedor × perdedor) para `maps` mapas jogados: 3 → 3×0 e 2×1. */
export function scoreOptions(maps: number): { won: number; lost: number }[] {
  const n = Math.min(Math.max(Math.trunc(maps) || 1, 1), 5);
  const list: { won: number; lost: number }[] = [];
  for (let won = n; won > n - won; won--) list.push({ won, lost: n - won });
  return list;
}

/**
 * Resultado oficial do mix para o bolão: vencedor pelos mapas, identificado pelo
 * time em que jogou cada capitão; MVP e lanterna como marcados na finalização.
 */
export function outcomeOf(input: {
  maps: { scoreA: number | null; scoreB: number | null }[];
  teamOf: (userId: string) => "A" | "B" | null;
  captains: [string, string];
  mvpId: string | null;
  lanternaId: string | null;
}): MixOutcome {
  let a = 0;
  let b = 0;
  for (const m of input.maps) {
    if (m.scoreA == null || m.scoreB == null || m.scoreA === m.scoreB) continue;
    if (m.scoreA > m.scoreB) a++;
    else b++;
  }
  const side = a > b ? "A" : b > a ? "B" : null;
  const winnerCaptain = side ? (input.captains.find((c) => input.teamOf(c) === side) ?? null) : null;
  return {
    winnerCaptain,
    mapsWon: Math.max(a, b),
    mapsLost: Math.min(a, b),
    mvpId: input.mvpId,
    lanternaId: input.lanternaId,
  };
}

export function scorePrediction(p: Prediction, o: MixOutcome): PredictionScore {
  const winner = o.winnerCaptain != null && p.winnerCaptain === o.winnerCaptain;
  const score = winner && p.mapsWon === o.mapsWon && p.mapsLost === o.mapsLost;
  const mvp = p.mvpId != null && p.mvpId === o.mvpId;
  const lanterna = p.lanternaId != null && p.lanternaId === o.lanternaId;
  return {
    winner,
    score,
    mvp,
    lanterna,
    points:
      (winner ? BOLAO_POINTS.winner : 0) +
      (score ? BOLAO_POINTS.score : 0) +
      (mvp ? BOLAO_POINTS.mvp : 0) +
      (lanterna ? BOLAO_POINTS.lanterna : 0),
  };
}

export interface BolaoRankingRow {
  userId: string;
  points: number;
  bets: number;
  winners: number;
  scores: number;
  mvps: number;
  lanternas: number;
}

/**
 * Ranking dos palpiteiros: mais pontos; desempate por placares exatos, depois
 * MVPs certos, depois menos palpites (melhor aproveitamento).
 */
export function bolaoRanking(scored: { userId: string; score: PredictionScore }[]): BolaoRankingRow[] {
  const rows = new Map<string, BolaoRankingRow>();
  for (const { userId, score } of scored) {
    const r = rows.get(userId) ?? { userId, points: 0, bets: 0, winners: 0, scores: 0, mvps: 0, lanternas: 0 };
    r.points += score.points;
    r.bets += 1;
    if (score.winner) r.winners += 1;
    if (score.score) r.scores += 1;
    if (score.mvp) r.mvps += 1;
    if (score.lanterna) r.lanternas += 1;
    rows.set(userId, r);
  }
  return [...rows.values()].sort(
    (x, y) =>
      y.points - x.points ||
      y.scores - x.scores ||
      y.mvps - x.mvps ||
      x.bets - y.bets ||
      x.userId.localeCompare(y.userId),
  );
}
