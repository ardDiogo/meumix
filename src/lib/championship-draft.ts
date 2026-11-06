/**
 * Draft do campeonato: potes, adedonha entre os capitães (define a ordem) e
 * escolhas em serpentina. Funções puras (testes: `npm run test:campeonato`).
 */

export interface DraftPick {
  pickNo: number;
  pot: number;
  teamId: string;
  userId: string;
}

/**
 * Time da vez na escolha `pickNo` (1, 2, 3…). Pote ímpar segue a ordem
 * (1→5); pote par volta (5→1): quem escolheu por último escolhe primeiro.
 */
export function snakeSlot(pickNo: number, order: string[]) {
  const n = order.length;
  const i = pickNo - 1;
  const pot = Math.floor(i / n) + 1;
  const pos = i % n;
  const teamId = order[pot % 2 === 1 ? pos : n - 1 - pos]!;
  return { pot, teamId, turnInPot: pos + 1 };
}

/** Ordem completa das escolhas (uma linha por pote). */
export function snakeOrder(order: string[], pots: number) {
  return Array.from({ length: pots }, (_, p) =>
    Array.from({ length: order.length }, (_, k) => snakeSlot(p * order.length + k + 1, order).teamId),
  );
}

/**
 * Adedonha: todos mostram de 0 a 5; a contagem começa em `start` (conta 1) e
 * segue a roda. Quem a contagem atingir no total escolhe na próxima posição.
 * Total 0 volta um (fica com quem está antes do começo).
 */
export function resolveAdedonha(remaining: string[], start: string, values: Record<string, number>) {
  const n = remaining.length;
  const startIdx = Math.max(0, remaining.indexOf(start));
  const total = remaining.reduce((s, id) => s + (values[id] ?? 0), 0);
  const idx = (((startIdx + total - 1) % n) + n) % n;
  return { total, picked: remaining[idx]! };
}

/** Estado das escolhas: a próxima (time, pote) ou null quando acabou. */
export function draftProgress(order: string[], pots: number, picks: DraftPick[]) {
  const total = order.length * pots;
  const made = picks.length;
  const next = made < total ? { pickNo: made + 1, ...snakeSlot(made + 1, order) } : null;
  return { total, made, next };
}

/**
 * Potes prontos para o draft: cada inscrito que não é capitão em um pote, e
 * cada pote com um jogador por time.
 */
export function potIssues(
  players: { userId: string; pot: number | null }[],
  captains: Set<string>,
  potCount: number,
  teamCount: number,
) {
  const issues: string[] = [];
  const pool = players.filter((p) => !captains.has(p.userId));
  const loose = pool.filter((p) => p.pot == null || p.pot < 1 || p.pot > potCount).length;
  if (loose) issues.push(loose === 1 ? "1 jogador ainda sem pote." : `${loose} jogadores ainda sem pote.`);
  for (let pot = 1; pot <= potCount; pot++) {
    const n = pool.filter((p) => p.pot === pot).length;
    if (n !== teamCount) issues.push(`Pote ${pot}: ${n} de ${teamCount} jogadores.`);
  }
  return issues;
}
