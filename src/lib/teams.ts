/**
 * Divide jogadores em dois times equilibrados pelo ELO (guloso: cada jogador,
 * do maior para o menor ELO, vai para o time com menor soma que ainda tem vaga).
 */
export function balanceTeams(
  playerIds: string[],
  elos: Map<string, number>,
  teamSize = Math.ceil(playerIds.length / 2),
) {
  const sorted = [...playerIds].sort((a, b) => (elos.get(b) ?? 0) - (elos.get(a) ?? 0));
  const a: string[] = [];
  const b: string[] = [];
  let sumA = 0;
  let sumB = 0;
  for (const id of sorted) {
    const elo = elos.get(id) ?? 0;
    if ((sumA <= sumB && a.length < teamSize) || b.length >= teamSize) {
      a.push(id);
      sumA += elo;
    } else {
      b.push(id);
      sumB += elo;
    }
  }
  return { a, b, avgA: a.length ? sumA / a.length : 0, avgB: b.length ? sumB / b.length : 0 };
}
