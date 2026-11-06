/**
 * Chave dos playoffs: confrontos pela classificação (1º × último classificado…)
 * e avanço do vencedor. Funções puras (testes: `npm run test:campeonato`).
 * No banco: stage = "playoff", round = fase (1 = primeira), leg = posição na fase.
 */
import type { PlayoffFormat } from "./championship";

/** Primeira fase: pares de colocação (o melhor colocado é o mandante). */
const SEEDS: Record<Exclude<PlayoffFormat, "none">, [number, number][]> = {
  final: [[1, 2]],
  semis_final: [
    [1, 4],
    [2, 3],
  ],
  round16_quarters_semis_final: [
    [1, 16],
    [8, 9],
    [4, 13],
    [5, 12],
    [2, 15],
    [7, 10],
    [3, 14],
    [6, 11],
  ],
  quarters_semis_final: [
    [1, 8],
    [4, 5],
    [2, 7],
    [3, 6],
  ],
};

const NAMES: Record<Exclude<PlayoffFormat, "none">, string[]> = {
  final: ["Final"],
  semis_final: ["Semifinal", "Final"],
  quarters_semis_final: ["Quartas de final", "Semifinal", "Final"],
  round16_quarters_semis_final: ["Oitavas de final", "Quartas de final", "Semifinal", "Final"],
};

export const playoffRounds = (format: PlayoffFormat) => (format === "none" ? 0 : NAMES[format].length);

/** "Semifinal 1", "Final", "Quartas de final 3". */
export function playoffLabel(format: PlayoffFormat, round: number, leg: number) {
  if (format === "none") return "Playoffs";
  const name = NAMES[format][round - 1] ?? "Playoffs";
  const games = SEEDS[format].length / 2 ** (round - 1);
  return games > 1 ? `${name} ${leg}` : name;
}

/** Nome da fase: "Semifinais", "Final". */
export function roundTitle(format: PlayoffFormat, round: number) {
  if (format === "none") return "";
  const name = NAMES[format][round - 1] ?? "";
  return name === "Semifinal" ? "Semifinais" : name;
}

export interface PlayoffFixture {
  round: number;
  leg: number;
  home: string | null;
  away: string | null;
  /** Colocação na fase classificatória (só na primeira fase). */
  seeds: [number, number] | null;
}

/**
 * Monta a chave inteira: a primeira fase com os classificados (na ordem da
 * classificação) e as seguintes vazias, esperando os vencedores.
 */
export function buildBracket(format: PlayoffFormat, ranked: string[]): PlayoffFixture[] {
  if (format === "none") return [];
  const first = SEEDS[format];
  if (ranked.length < first.length * 2) throw new Error("Times insuficientes para os playoffs.");
  const out: PlayoffFixture[] = first.map(([a, b], i) => ({
    round: 1,
    leg: i + 1,
    home: ranked[a - 1]!,
    away: ranked[b - 1]!,
    seeds: [a, b],
  }));
  for (let round = 2, games = first.length / 2; games >= 1; round++, games /= 2)
    for (let leg = 1; leg <= games; leg++) out.push({ round, leg, home: null, away: null, seeds: null });
  return out;
}

/** Para onde vai o vencedor: fase seguinte, posição e lado (null na final). */
export function nextSlot(format: PlayoffFormat, round: number, leg: number) {
  if (round >= playoffRounds(format)) return null;
  return { round: round + 1, leg: Math.ceil(leg / 2), side: leg % 2 === 1 ? ("home" as const) : ("away" as const) };
}
