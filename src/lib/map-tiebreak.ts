import { randomInt } from "node:crypto";

/**
 * Desempate de mapas (docs/especificacao-tecnica.md, 4.5). Funções puras,
 * exceto `secureSample`, que usa o gerador aleatório criptográfico.
 */

export type Tally = { id: string; votes: number }[];

export interface TieResult {
  /** Mapas com mais votos que o N-ésimo colocado: entram com certeza. */
  guaranteed: string[];
  /** Mapas empatados na linha de corte. */
  zone: string[];
  /** Vagas restantes para a zona de empate. */
  slots: number;
  tie: boolean;
}

/** Ordena por votos (desc) e, no empate, pela ordem original (estável). */
export function sortTally(tally: Tally): Tally {
  return [...tally].sort((a, b) => b.votes - a.votes);
}

/**
 * Analisa se os N primeiros estão definidos. Mapas sem voto contam com 0 —
 * passe todos os candidatos em `tally`.
 */
export function computeTie(tally: Tally, n: number): TieResult {
  const sorted = sortTally(tally);
  if (sorted.length <= n) {
    return { guaranteed: sorted.map((m) => m.id), zone: [], slots: 0, tie: false };
  }
  const cut = sorted[n - 1]!.votes;
  const guaranteed = sorted.filter((m) => m.votes > cut).map((m) => m.id);
  const zone = sorted.filter((m) => m.votes === cut).map((m) => m.id);
  const slots = n - guaranteed.length;
  return { guaranteed, zone, slots, tie: zone.length > slots };
}

/** Escolhe `k` itens ao acaso (Fisher–Yates com gerador criptográfico). */
export function secureSample<T>(items: T[], k: number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a.slice(0, k);
}

/** Conta votos (arrays de mapas) apenas entre os candidatos. */
export function countVotes(candidates: string[], ballots: string[][]): Tally {
  const counts = new Map(candidates.map((c) => [c, 0]));
  for (const ballot of ballots) {
    for (const m of new Set(ballot)) if (counts.has(m)) counts.set(m, counts.get(m)! + 1);
  }
  return candidates.map((id) => ({ id, votes: counts.get(id)! }));
}
