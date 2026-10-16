/** Constantes das regras do mix (docs/regras-do-mix.md). */
export const MAP_VOTES_PER_PLAYER = 4;
export const CAPTAIN_VOTES_PER_PLAYER = 2;
/** Quantidade de mapas que entram na rotação. */
export const MAPS_IN_ROTATION = 4;
export const CAPTAINS = 2;

/** Ranking de votos: [id, votos] do mais votado para o menos votado. */
export function tally(ids: string[]) {
  const counts = new Map<string, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}
