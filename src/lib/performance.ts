/**
 * Desempenho no mix comparado com a média do próprio jogador (página do mix e
 * imagem compartilhada). Funções puras.
 */
import { kdrOf, type StatRow } from "./match-highlights";
import type { PlayerAverage } from "@/services/match-report";

export type Stat = "kdr" | "adr" | "fk" | "kast";

export const STATS: Stat[] = ["kdr", "adr", "fk", "kast"];
export const statOf = (r: StatRow, m: Stat): number | null =>
  m === "kdr" ? kdrOf(r) : m === "adr" ? r.adr : m === "fk" ? r.fk : r.kast;

/**
 * Base mínima de cada estatística no "Geral": evita que uma média pequena
 * (ex.: 0,5 FK por mix) transforme 1 FK a mais em +100%.
 */
export const FLOOR: Record<Stat, number> = { kdr: 0.5, adr: 40, fk: 2, kast: 40 };

/** Faixa (±3%) em que o jogador conta como "na média" (amarelo). */
export const NEAR = 0.03;
export const YELLOW = "#eab308";
export const NO_AVG = "#52525b";

const mixHex = (a: string, b: string, t: number) =>
  "#" +
  [1, 3, 5]
    .map((i) => {
      const x = parseInt(a.slice(i, i + 2), 16);
      const y = parseInt(b.slice(i, i + 2), 16);
      return Math.round(x + (y - x) * t)
        .toString(16)
        .padStart(2, "0");
    })
    .join("");

/**
 * Cor pela diferença relativa à média (0,25 = 25% acima): amarelo perto da
 * média; verde acima e vermelho abaixo, cada vez mais vivos quanto mais longe.
 */
export function toneColor(rel: number) {
  if (Math.abs(rel) <= NEAR) return YELLOW;
  const t = Math.min(1, (Math.abs(rel) - NEAR) / 0.5);
  return rel > 0 ? mixHex("#5b8a68", "#22c55e", t) : mixHex("#9a5a5a", "#ff3b3b", t);
}

/**
 * Geral: quanto o jogador passou (ou ficou abaixo) da própria média em cada
 * estatística, em %, limitado a ±100% por estatística, e a média disso.
 */
export function overall(r: StatRow, avg: PlayerAverage | undefined) {
  if (!avg) return null;
  const parts = STATS.flatMap((k) => {
    const cur = statOf(r, k);
    const base = avg[k];
    if (cur == null || base == null) return [];
    const pct = Math.max(-1, Math.min(1, (cur - base) / Math.max(base, FLOOR[k]))) * 100;
    return [{ k, pct }];
  });
  if (!parts.length) return null;
  return { value: parts.reduce((a, p) => a + p.pct, 0) / parts.length, parts };
}
