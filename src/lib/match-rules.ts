/** MVP e lanterna da partida (docs/especificacao-tecnica.md, 4.13). */

export interface ScoreLine {
  kills: number;
  deaths: number;
  assists: number;
  /** First kills (abertura do round). */
  firstKills: number;
  adr: number | null;
}

/** Pontuação do MVP: K × 3 + A × 1,5 + FK × 1,2 + ADR × 0,2 − D × 2. */
export const mvpScore = (p: ScoreLine) =>
  p.kills * 3 + p.assists * 1.5 + p.firstKills * 1.2 + (p.adr ?? 0) * 0.2 - p.deaths * 2;

export const lanternaScore = (p: ScoreLine) => p.kills + (p.adr ?? 0) / 100 + (p.kills / Math.max(p.deaths, 1)) * 10;

/** Índices do MVP (maior pontuação) e do lanterna (menor). */
export function pickMvpAndLanterna(players: ScoreLine[]) {
  if (!players.length) return { mvp: -1, lanterna: -1 };
  let mvp = 0;
  let lanterna = 0;
  players.forEach((p, i) => {
    if (mvpScore(p) > mvpScore(players[mvp]!)) mvp = i;
    if (lanternaScore(p) < lanternaScore(players[lanterna]!)) lanterna = i;
  });
  return { mvp, lanterna: players.length > 1 ? lanterna : -1 };
}
