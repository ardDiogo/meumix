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
  /** Swing da GC × rounds ÷ 100, somado nos mapas: rounds ganhos (ou perdidos) para o time. */
  swingRounds?: number | null;
  /** Clutches vencidos (dados da GC): 1v1 e 1v2 ou mais. */
  clutch1v1?: number | null;
  clutchNv?: number | null;
}

/**
 * Pesos da PTS (a mesma conta de public.mix_pts, migração 0063). `deathNoData`: cada morte
 * quando o mix não tem os dados de trade.
 */
export const PTS = {
  kill: 3,
  assist: 1.5,
  firstKill: 2,
  adr: 0.2,
  tradedDeath: 0.5,
  death: 2.5,
  deathNoData: 2,
  clutch1v1: 3,
  clutchNv: 5,
  swingRound: 5,
} as const;

/** Mortes trocadas (até o total de mortes) e as não trocadas. */
export function deathSplit(p: Pick<ScoreLine, "deaths" | "tradedDeaths">) {
  const traded = p.tradedDeaths == null ? 0 : Math.min(Math.max(p.tradedDeaths, 0), p.deaths);
  return { traded, untraded: p.deaths - traded, known: p.tradedDeaths != null };
}

/**
 * PTS (MVP, ordem da planilha e desempenho do ELO):
 * K × 3 + A × 1,5 + FK × 2 + ADR × 0,2 − morte trocada × 0,5 − morte não trocada × 2,5
 * + clutch 1v1 × 3 + clutch 1v2+ × 5 + rounds do Swing × 5
 * (sem os dados de trade da GC, toda morte × 2; sem Swing ou clutch, 0).
 */
export const mvpScore = (p: ScoreLine) => {
  const { traded, untraded, known } = deathSplit(p);
  const deaths = known ? traded * PTS.tradedDeath + untraded * PTS.death : p.deaths * PTS.deathNoData;
  return (
    p.kills * PTS.kill +
    p.assists * PTS.assist +
    p.firstKills * PTS.firstKill +
    (p.adr ?? 0) * PTS.adr -
    deaths +
    (p.clutch1v1 ?? 0) * PTS.clutch1v1 +
    (p.clutchNv ?? 0) * PTS.clutchNv +
    (p.swingRounds ?? 0) * PTS.swingRound
  );
};

/** PTS para mostrar: nunca abaixo de 0 (a conta e o ELO usam o valor real). */
export const ptsShown = (v: number) => Math.max(0, v);

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
