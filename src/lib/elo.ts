/**
 * Cálculo de ELO por equipe (Elo clássico usando a média de cada time).
 * Isolado aqui para que a mesma regra seja usada pela demo e pelo backend real.
 */
export const ELO_K_FACTOR = 32;
export const DEFAULT_STARTING_ELO = 1000;

export function expectedScore(ratingA: number, ratingB: number) {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
}

/** Variação de ELO para o time A (o time B recebe o valor oposto). */
export function eloDelta(avgA: number, avgB: number, scoreA: 1 | 0.5 | 0, k = ELO_K_FACTOR) {
  return Math.round(k * (scoreA - expectedScore(avgA, avgB)));
}

export function average(values: number[]) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

/** Converte o histórico em pontos para gráficos (ordem cronológica). */
export function toEloSeries(
  history: { date: string; eloBefore: number; eloAfter: number; mixId: string }[],
  mixNames: Map<string, string>,
) {
  return history.map((h) => ({
    date: h.date,
    elo: h.eloAfter,
    delta: h.eloAfter - h.eloBefore,
    label: mixNames.get(h.mixId) ?? "Mix",
  }));
}

/**
 * Soma das variações de ELO ganhas em mixes a partir de uma data. Ajustes do admin
 * (ELO inicial, nível GC, correção manual) não têm mix e ficam de fora.
 */
export function eloChangeSince(
  history: { date: string; eloBefore: number; eloAfter: number; mixId: string }[],
  since: Date | null,
) {
  return history
    .filter((h) => h.mixId && (!since || new Date(h.date) >= since))
    .reduce((s, h) => s + h.eloAfter - h.eloBefore, 0);
}
