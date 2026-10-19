const r2 = (n: number) => Math.round(n * 100) / 100;

/** Nota geral por mix: fórmula pública aproximada do Rating 2.0 (≈1,00 é a média). */
export function approxRating(o: {
  kills: number;
  deaths: number;
  assists: number;
  rounds: number;
  adr: number | null;
  kast: number | null;
}) {
  if (!o.rounds || o.adr == null || o.kast == null) return null;
  const kpr = o.kills / o.rounds;
  const dpr = o.deaths / o.rounds;
  const apr = o.assists / o.rounds;
  const impact = 2.13 * kpr + 0.42 * apr - 0.41;
  return r2(0.0073 * o.kast + 0.3591 * kpr - 0.5329 * dpr + 0.2372 * impact + 0.0032 * o.adr + 0.1587);
}
