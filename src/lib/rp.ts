import { mvpScore, type ScoreLine } from "./match-rules";

/*
 * RP do MeuMix (supabase/migrations/0056 e 0058): o que o ELO de cada liga soma a cada mix.
 * A mesma conta roda no banco (recálculo do ELO); esta é para a tela (prévia e explicação).
 *
 *   RP = resultado + desempenho
 *   resultado  = 40 × (S − E)  S: 1 vitória, 0,5 empate, 0 derrota · E: chance pelo ELO médio dos times
 *   desempenho = 30 × (PTS − média) ÷ média, de −20 a +20 (mix sem estatísticas: 0)
 */
export const RP_RESULT_K = 40;
export const RP_PERF_K = 30;
export const RP_PERF_CAP = 20;

export const winChance = (mine: number, theirs: number) => 1 / (1 + 10 ** ((theirs - mine) / 400));

export function rpResult(score: 1 | 0.5 | 0, myTeamElo: number, otherTeamElo: number) {
  return RP_RESULT_K * (score - winChance(myTeamElo, otherTeamElo));
}

export function rpPerformance(pts: number, ptsAvg: number | null) {
  if (ptsAvg == null) return 0;
  const v = (RP_PERF_K * (pts - ptsAvg)) / Math.max(Math.abs(ptsAvg), 1);
  return Math.min(Math.max(v, -RP_PERF_CAP), RP_PERF_CAP);
}

/** RP de cada jogador do mix (mesma ordem da lista). */
export function mixRp(
  players: (ScoreLine & { team: "A" | "B"; elo: number | null; score: 1 | 0.5 | 0 })[],
): { rp: number; result: number; perf: number }[] {
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const elo = (t: "A" | "B") => avg(players.filter((p) => p.team === t && p.elo != null).map((p) => p.elo!));
  const eloA = elo("A") ?? elo("B") ?? 0;
  const eloB = elo("B") ?? eloA;
  const stats = players.some((p) => p.kills > 0 || p.deaths > 0);
  const ptsAvg = stats ? avg(players.map(mvpScore)) : null;
  return players.map((p) => {
    const result = rpResult(p.score, p.team === "A" ? eloA : eloB, p.team === "A" ? eloB : eloA);
    const perf = rpPerformance(mvpScore(p), ptsAvg);
    return { rp: Math.round(Math.round(result * 100) / 100 + Math.round(perf * 100) / 100), result, perf };
  });
}
