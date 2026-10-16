/**
 * Sugestão de times e probabilidade de vitória
 * (docs/regras-do-mix.md, seção 7; docs/especificacao-tecnica.md, 4.10–4.11).
 * Funções puras.
 */

export interface BalancePlayer {
  id: string;
  elo: number;
  level: number;
  games: number;
  wins: number;
  mvps: number;
  lanterns: number;
  adr: number | null;
  kast: number | null;
  /** HLTV 2.0 lido da última análise do CSRep (opcional). */
  hltv?: number | null;
}

const LEVEL_MULT: Record<number, number> = { 8: 1.5, 9: 2, 10: 2.5 };
/** Diferença de pontos considerada empate técnico (desempata pelo duelo jogador a jogador). */
export const DIFF_TOLERANCE = 5;
/** Concordância mínima para aceitar a sugestão. */
export const ACCEPT_RATIO = 0.8;

const winRate = (p: BalancePlayer) => (p.games ? p.wins / p.games : 0.5);

/** Ajuste leve pelo CSRep: HLTV 1,00 = neutro; ±0,10 ≈ ±2 pontos. Limitado a ±10. */
export const csrepAdjust = (hltv?: number | null) =>
  hltv == null || !Number.isFinite(hltv) ? 0 : Math.max(-10, Math.min(10, (hltv - 1) * 20));

/** Pontuação do jogador (4.10), com o ajuste opcional do CSRep. */
export function playerScore(p: BalancePlayer) {
  const level = Math.max(1, Math.min(10, Math.round(p.level)));
  return (
    level * 10 * (LEVEL_MULT[level] ?? 1) + winRate(p) * 80 - Math.max(0, p.lanterns - 1) * 15 + csrepAdjust(p.hltv)
  );
}

export interface Suggestion {
  teamA: string[];
  teamB: string[];
  scoreA: number;
  scoreB: number;
  diff: number;
}

/** Testa as 126 divisões únicas (252 com espelho) de 10 jogadores em 5×5. */
export function suggestTeams(players: BalancePlayer[]): Suggestion | null {
  if (players.length !== 10) return null;
  const scores = players.map(playerScore);
  const total = scores.reduce((s, x) => s + x, 0);
  const candidates: { mask: number; diff: number; matchup: number }[] = [];
  // Fixa o jogador 0 no time A para não repetir divisões espelhadas.
  for (let mask = 0; mask < 1 << 10; mask++) {
    if (!(mask & 1)) continue;
    let count = 0;
    for (let m = mask; m; m &= m - 1) count++;
    if (count !== 5) continue;
    const a: number[] = [];
    const b: number[] = [];
    scores.forEach((s, i) => (mask & (1 << i) ? a : b).push(s));
    const sumA = a.reduce((s, x) => s + x, 0);
    a.sort((x, y) => y - x);
    b.sort((x, y) => y - x);
    const matchup = a.reduce((s, x, i) => s + Math.abs(x - b[i]!), 0);
    candidates.push({ mask, diff: Math.abs(2 * sumA - total), matchup });
  }
  const best = Math.min(...candidates.map((c) => c.diff));
  const pick = candidates
    .filter((c) => c.diff <= best + DIFF_TOLERANCE)
    .sort((x, y) => x.matchup - y.matchup || x.diff - y.diff)[0]!;
  const teamA = players.filter((_, i) => pick.mask & (1 << i)).map((p) => p.id);
  const teamB = players.filter((_, i) => !(pick.mask & (1 << i))).map((p) => p.id);
  const sum = (ids: string[]) => ids.reduce((s, id) => s + scores[players.findIndex((p) => p.id === id)]!, 0);
  return { teamA, teamB, scoreA: sum(teamA), scoreB: sum(teamB), diff: Math.abs(sum(teamA) - sum(teamB)) };
}

/* ------------------------- Probabilidade de vitória ------------------------- */

const W = { winRate: 40, mvp: 30, lantern: 20, adr: 0.1, kast: 0.1, hltv: 15 };
const PRIOR_GAMES = 30;

/** Força do jogador (4.11). Win rate puxado para 50% com poucos jogos. */
export function playerStrength(p: BalancePlayer) {
  const g = Math.max(0, p.games);
  const wr = winRate(p);
  const adjusted = g < PRIOR_GAMES ? (wr * g + 0.5 * PRIOR_GAMES) / (g + PRIOR_GAMES) : wr;
  const mvpRate = g ? p.mvps / g : 0;
  const lanternRate = g ? p.lanterns / g : 0;
  const experience = Math.min(g, PRIOR_GAMES) / 3;
  return Math.max(
    1,
    p.elo / 15 +
      adjusted * W.winRate +
      mvpRate * W.mvp -
      lanternRate * W.lantern +
      experience +
      (p.adr ?? 70) * W.adr +
      (p.kast ?? 65) * W.kast +
      (p.hltv != null ? (p.hltv - 1) * W.hltv : 0),
  );
}

/** Chance (0–1) do time A vencer. */
export function winProbability(teamA: BalancePlayer[], teamB: BalancePlayer[]) {
  const a = teamA.reduce((s, p) => s + playerStrength(p), 0);
  const b = teamB.reduce((s, p) => s + playerStrength(p), 0);
  return a + b > 0 ? a / (a + b) : 0.5;
}
