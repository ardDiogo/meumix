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

/**
 * Capitães já garantidos antes de todos votarem (seção 4): o 2º colocado não
 * pode mais ser alcançado pelo 3º. Cada classificado vota em até 2 jogadores,
 * no máximo 1 voto por jogador, então o 3º ganha no máximo 1 voto de cada
 * classificado que ainda tem voto sobrando (e que não votou nele).
 */
export function captainsDecided(
  classified: string[],
  votes: { voter: string; candidate: string }[],
): [string, string] | null {
  const counted = votes.filter((v) => classified.includes(v.voter) && classified.includes(v.candidate));
  const count = new Map(classified.map((id) => [id, 0]));
  const given = new Map(classified.map((id) => [id, [] as string[]]));
  for (const v of counted) {
    count.set(v.candidate, count.get(v.candidate)! + 1);
    given.get(v.voter)!.push(v.candidate);
  }
  const order = [...count.entries()].sort((a, b) => b[1] - a[1]);
  if (order.length < 3) return null;
  const [first, second] = order;
  if (second![1] === 0) return null;
  // Para cada outro jogador, o máximo que ele ainda pode alcançar.
  for (const [id, votesNow] of order.slice(2)) {
    const canStillGet = classified.filter((voter) => {
      const g = given.get(voter)!;
      return voter !== id && g.length < CAPTAIN_VOTES_PER_PLAYER && !g.includes(id);
    }).length;
    if (votesNow + canStillGet >= second![1]) return null;
  }
  return [first![0], second![0]];
}
