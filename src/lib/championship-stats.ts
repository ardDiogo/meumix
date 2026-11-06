/**
 * Estatísticas e colocação final do campeonato (só com os dados do próprio
 * campeonato, nunca os dos mixes). Funções puras (testes: `npm run test:campeonato`).
 */
import type { PlayoffFormat } from "./championship";
import { playoffRounds } from "./championship-playoffs";
import { aggregateGc, type GcLine } from "./gc-analysis";
import type { GcMapStored } from "./gc-api";

/** Mínimo de mapas para disputar médias (metade do máximo jogado, ao menos 1). */
export const minMapsFor = (lines: GcLine[]) => Math.max(1, Math.ceil(Math.max(0, ...lines.map((l) => l.maps)) / 2));

export const kdOf = (l: GcLine) => (l.d ? l.k / l.d : l.k);

export interface Board {
  key: string;
  title: string;
  /** Média: exige o mínimo de mapas. */
  rate: boolean;
  value: (l: GcLine) => number | null;
  format: (n: number) => string;
}

const dec = (n: number, d = 2) => n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

export const BOARDS: Board[] = [
  { key: "rating", title: "Melhor rating", rate: true, value: (l) => l.rating, format: (n) => dec(n) },
  { key: "kd", title: "Maior K/D", rate: true, value: kdOf, format: (n) => dec(n) },
  { key: "adr", title: "Maior ADR", rate: true, value: (l) => l.adr, format: (n) => dec(n, 1) },
  { key: "kills", title: "Mais kills", rate: false, value: (l) => l.k, format: (n) => String(n) },
  { key: "hs", title: "Mais headshots", rate: false, value: (l) => l.hs, format: (n) => String(n) },
  {
    key: "hsRate",
    title: "Melhor % de headshot",
    rate: true,
    value: (l) => l.hsRate,
    format: (n) => `${Math.round(n)}%`,
  },
];

/** Top N de uma métrica (médias só com o mínimo de mapas; zero não entra). */
export function leaders(lines: GcLine[], board: Board, top = 5) {
  const min = minMapsFor(lines);
  return lines
    .filter((l) => l.userId && (!board.rate || l.maps >= min))
    .map((l) => ({ line: l, value: board.value(l) }))
    .filter((x): x is { line: GcLine; value: number } => x.value != null && x.value > 0)
    .sort((a, b) => b.value - a.value || b.line.rounds - a.line.rounds)
    .slice(0, top);
}

/** MVP: maior rating médio entre quem jogou o mínimo de mapas. */
export const mvpOf = (lines: GcLine[]) => leaders(lines, BOARDS[0]!, 1)[0]?.line ?? null;

/** Melhor jogador em cada mapa (maior rating naquele mapa). */
export function bestByMap(maps: GcMapStored[]) {
  const ids = [...new Set(maps.map((m) => m.mapId))];
  return ids
    .map((mapId) => {
      const lines = aggregateGc(maps.filter((m) => m.mapId === mapId)).filter((l) => l.userId && l.rating != null);
      const best = lines.sort((a, b) => b.rating! - a.rating! || b.k - a.k)[0] ?? null;
      return { mapId, games: maps.filter((m) => m.mapId === mapId).length, best };
    })
    .filter((x) => x.best)
    .sort((a, b) => b.games - a.games || a.mapId.localeCompare(b.mapId));
}

export interface FinalMatch {
  stage: "group" | "playoff";
  round: number;
  homeTeam: string | null;
  awayTeam: string | null;
  winnerTeam: string | null;
}

/**
 * Colocação final (para a premiação): campeão e vice pela final; nas
 * semifinais/quartas, os eliminados ficam na ordem da fase classificatória;
 * os demais seguem a classificação. Sem playoffs, vale a classificação.
 * Posição ainda indefinida = null.
 */
export function finalPlacing(format: PlayoffFormat, groupOrder: string[], matches: FinalMatch[]): (string | null)[] {
  const rounds = playoffRounds(format);
  const playoffs = matches.filter((m) => m.stage === "playoff");
  if (!rounds) {
    const groupDone = matches.filter((m) => m.stage === "group").every((m) => m.winnerTeam);
    return groupOrder.map((t) => (groupDone ? t : null));
  }
  if (!playoffs.length) return groupOrder.map(() => null);
  const rank = (t: string) => groupOrder.indexOf(t);
  const out: (string | null)[] = [];
  // Da final para trás: perdedores de cada fase, na ordem da classificação.
  for (let round = rounds; round >= 1; round--) {
    const games = playoffs.filter((m) => m.round === round);
    if (round === rounds) {
      const f = games[0];
      const loser = f?.winnerTeam ? (f.winnerTeam === f.homeTeam ? f.awayTeam : f.homeTeam) : null;
      out.push(f?.winnerTeam ?? null, loser);
      continue;
    }
    const losers = games.map((m) => (m.winnerTeam ? (m.winnerTeam === m.homeTeam ? m.awayTeam : m.homeTeam) : null));
    if (losers.some((l) => !l)) out.push(...losers.map(() => null));
    else out.push(...(losers as string[]).sort((a, b) => rank(a) - rank(b)));
  }
  const inPlayoffs = new Set(playoffs.flatMap((m) => [m.homeTeam, m.awayTeam]).filter(Boolean));
  out.push(...groupOrder.filter((t) => !inPlayoffs.has(t)));
  return out;
}
