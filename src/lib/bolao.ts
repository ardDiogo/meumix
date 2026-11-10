/**
 * Regras do bolão do mix (sem dinheiro: só pontos). Funções puras, testadas em
 * `bolao.test.ts`. Os pontos são calculados na hora a partir do resultado
 * oficial: corrigir ou excluir o mix corrige o bolão sozinho.
 */

export const BOLAO_POINTS = {
  /** Acertar o resultado: o time vencedor ou o empate. */
  winner: 3,
  /** Acertar também como foi: vitória seca ou com deslize (empate certo já leva). */
  score: 2,
  mvp: 3,
  lanterna: 2,
} as const;

export const BOLAO_MAX = BOLAO_POINTS.winner + BOLAO_POINTS.score + BOLAO_POINTS.mvp + BOLAO_POINTS.lanterna;

/**
 * Como termina o mix, sem depender de quantos mapas (2, 3 ou 4):
 * vitória seca (o vencedor não perde mapa), vitória com deslize (perde algum) ou empate.
 */
export type BetKind = "sweep" | "close" | "draw";

export const BET_KIND_LABEL: Record<BetKind, string> = {
  sweep: "Vitória seca",
  close: "Vitória com deslize",
  draw: "Empate",
};

export const BET_KIND_HINT: Record<BetKind, string> = {
  sweep: "sem perder mapa: 2×0, 3×0, 4×0",
  close: "perdendo algum mapa: 2×1, 3×1, 3×2",
  draw: "1×1, 2×2",
};

/** Tipo do resultado pelo placar de mapas (vencedor × perdedor). */
export const kindOf = (won: number, lost: number): BetKind => (won === lost ? "draw" : lost === 0 ? "sweep" : "close");

/** Tipo de um palpite gravado (palpites antigos só têm o placar). */
export function betKindOf(r: {
  kind?: string | null;
  winner_captain?: string | null;
  maps_won?: number | null;
  maps_lost?: number | null;
}): BetKind {
  if (r.kind === "sweep" || r.kind === "close" || r.kind === "draw") return r.kind;
  if (!r.winner_captain) return "draw";
  return (r.maps_lost ?? 0) === 0 ? "sweep" : "close";
}

export interface Prediction {
  userId: string;
  /** Capitão do time que vai vencer (null: empate). */
  winnerCaptain: string | null;
  kind: BetKind;
  mvpId: string | null;
  lanternaId: string | null;
}

export interface MixOutcome {
  /** Capitão do time vencedor (null: empate ou capitão fora do resultado). */
  winnerCaptain: string | null;
  /** null: nenhum mapa decidido. */
  kind: BetKind | null;
  /** Placar de mapas (vencedor × perdedor), para mostrar. */
  mapsWon: number;
  mapsLost: number;
  mvpId: string | null;
  lanternaId: string | null;
}

export interface PredictionScore {
  points: number;
  /** Acertou o resultado (vencedor ou empate). */
  winner: boolean;
  /** Acertou também o tipo (seca ou com deslize; no empate, junto com o resultado). */
  score: boolean;
  mvp: boolean;
  lanterna: boolean;
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
    kind: a + b === 0 ? null : kindOf(Math.max(a, b), Math.min(a, b)),
    mapsWon: Math.max(a, b),
    mapsLost: Math.min(a, b),
    mvpId: input.mvpId,
    lanternaId: input.lanternaId,
  };
}

export function scorePrediction(p: Prediction, o: MixOutcome): PredictionScore {
  const draw = o.kind === "draw" && p.kind === "draw";
  const winner = draw || (o.winnerCaptain != null && p.kind !== "draw" && p.winnerCaptain === o.winnerCaptain);
  const score = winner && p.kind === o.kind;
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
 * Ranking dos palpiteiros: mais pontos; desempate por resultados com o tipo certo, depois
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
