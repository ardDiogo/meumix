/** MVP e lanterna da partida (docs/especificacao-tecnica.md, 4.13). */

export interface ScoreLine {
  kills: number;
  deaths: number;
  assists: number;
  /** First kills (abertura do round). */
  firstKills: number;
  adr: number | null;
  /** Mortes que um colega trocou (dados da GC); sem o dado, null. */
  tradedDeaths?: number | null;
}

/** Pesos da PTS (a mesma conta de public.mix_pts, migração 0060). */
export const PTS = { kill: 3, assist: 1.5, firstKill: 2, adr: 0.2, tradedDeath: 0.5, death: 1.5 } as const;

/** Mortes trocadas (até o total de mortes) e as não trocadas. */
export function deathSplit(p: Pick<ScoreLine, "deaths" | "tradedDeaths">) {
  const traded = p.tradedDeaths == null ? 0 : Math.min(Math.max(p.tradedDeaths, 0), p.deaths);
  return { traded, untraded: p.deaths - traded, known: p.tradedDeaths != null };
}

/**
 * PTS (MVP, ordem da planilha e desempenho do ELO):
 * K × 3 + A × 1,5 + FK × 2 + ADR × 0,2 − morte trocada × 0,5 − morte não trocada × 1,5
 * (sem os dados de trade da GC, toda morte × 1,5).
 */
export const mvpScore = (p: ScoreLine) => {
  const { traded, untraded } = deathSplit(p);
  return (
    p.kills * PTS.kill +
    p.assists * PTS.assist +
    p.firstKills * PTS.firstKill +
    (p.adr ?? 0) * PTS.adr -
    traded * PTS.tradedDeath -
    untraded * PTS.death
  );
};

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
