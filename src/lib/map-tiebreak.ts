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

/**
 * Mapas já garantidos com `remaining` classificados ainda sem votar (cada voto
 * marca `MAP_VOTES_PER_PLAYER` mapas diferentes, então cada mapa ganha no máximo
 * 1 voto por pessoa). Um mapa está garantido quando, mesmo com todos os votos que
 * faltam indo para os rivais, menos de `n` deles conseguem alcançá-lo (empate conta
 * como alcançar). Está fora quando `n` rivais já têm mais votos do que ele consegue
 * chegar. `decided`: todos garantidos ou fora — os votos que faltam não mudam nada.
 */
export function lockedMaps(tally: Tally, n: number, remaining: number) {
  if (remaining <= 0) {
    const tie = computeTie(tally, n);
    return { locked: tie.tie ? tie.guaranteed : [...tie.guaranteed, ...tie.zone], decided: !tie.tie };
  }
  if (tally.length <= n) return { locked: tally.map((m) => m.id), decided: true };
  const locked: string[] = [];
  let undecided = 0;
  for (const m of tally) {
    const rivals = tally.filter((x) => x.id !== m.id);
    const canReach = rivals.filter((x) => x.votes + remaining >= m.votes).length;
    const above = rivals.filter((x) => x.votes > m.votes + remaining).length;
    if (canReach < n) locked.push(m.id);
    else if (above < n) undecided++;
  }
  const ordered = sortTally(tally)
    .map((m) => m.id)
    .filter((id) => locked.includes(id));
  return { locked: ordered, decided: undecided === 0 && ordered.length === n };
}

/**
 * Desempate entre os capitães: cada um escolhe `slots` mapas entre os empatados.
 * Mapa escolhido pelos dois entra; as vagas que sobram ficam com a escolha de quem
 * perdeu o PPT (`loser`). Sem os dois votos, ou com discordância e sem PPT, espera.
 */
export function captainMaps(
  candidates: string[],
  slots: number,
  a: string[] | null,
  b: string[] | null,
  loser: "a" | "b" | null,
): { winners: string[] } | { waiting: "votes" | "ppt" } {
  if (!a || !b) return { waiting: "votes" };
  const agreed = candidates.filter((m) => a.includes(m) && b.includes(m));
  if (agreed.length >= slots) return { winners: agreed.slice(0, slots) };
  if (!loser) return { waiting: "ppt" };
  const extra = (loser === "a" ? a : b).filter((m) => !agreed.includes(m));
  return { winners: [...agreed, ...extra].slice(0, slots) };
}
