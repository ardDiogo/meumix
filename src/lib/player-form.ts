import type { ID, MapId, Mix } from "@/types/domain";
import { playerResult, playerSide, seriesScore, statsForPlayer } from "./stats";

/**
 * Forma do jogador ao longo dos mixes: K/D, ADR, KAST, vitórias e uma nota
 * geral (aproximação do Rating 2.0 da HLTV com os dados que temos).
 */

export interface FormPoint {
  mixId: string;
  date: string;
  label: string;
  result: "win" | "loss" | "draw";
  score: string | null;
  kd: number;
  adr: number | null;
  kast: number | null;
  rating: number | null;
  /** % de vitórias acumulado até este mix. */
  winRate: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** Nota geral por mix: fórmula pública aproximada do Rating 2.0 (≈1,00 é a média). */
export function approxRating(o: {
  kills: number;
  deaths: number;
  assists: number;
  rounds: number;
  adr: number | null;
  kast: number | null;
}) {
  if (!o.rounds || o.adr == null || o.kast == null) return null;
  const kpr = o.kills / o.rounds;
  const dpr = o.deaths / o.rounds;
  const apr = o.assists / o.rounds;
  const impact = 2.13 * kpr + 0.42 * apr - 0.41;
  return r2(0.0073 * o.kast + 0.3591 * kpr - 0.5329 * dpr + 0.2372 * impact + 0.0032 * o.adr + 0.1587);
}

/** Pontos em ordem cronológica (mais antigo → mais recente). */
export function formSeries(mixes: Mix[], playerId: ID): FormPoint[] {
  const sorted = [...mixes].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  const points: FormPoint[] = [];
  let wins = 0;
  for (const mix of sorted) {
    const result = playerResult(mix, playerId);
    if (!result) continue;
    const rows = statsForPlayer(mix, playerId);
    if (!rows.length) continue;
    const kills = sum(rows.map((r) => r.kills));
    const deaths = sum(rows.map((r) => r.deaths));
    const assists = sum(rows.map((r) => r.assists));
    const withRounds = rows.filter((r) => r.roundsPlayed);
    const rounds = sum(withRounds.map((r) => r.roundsPlayed!));
    const dmg = rows.filter((r) => r.damage != null && r.roundsPlayed);
    const kst = rows.filter((r) => r.kastRounds != null && r.roundsPlayed);
    const adr = dmg.length ? r2(sum(dmg.map((r) => r.damage!)) / sum(dmg.map((r) => r.roundsPlayed!))) : null;
    const kast = kst.length
      ? r2((sum(kst.map((r) => r.kastRounds!)) / sum(kst.map((r) => r.roundsPlayed!))) * 100)
      : null;
    if (result === "win") wins++;
    const score = seriesScore(mix);
    const side = playerSide(mix, playerId);
    points.push({
      mixId: mix.id,
      date: mix.scheduledAt,
      label: mix.name,
      result,
      score: score ? (side === "B" ? `${score[1]}:${score[0]}` : `${score[0]}:${score[1]}`) : null,
      kd: r2(kills / Math.max(deaths, 1)),
      adr,
      kast,
      rating: approxRating({ kills, deaths, assists, rounds, adr, kast }),
      winRate: r2((wins / (points.length + 1)) * 100),
    });
  }
  return points;
}

export type FormMetric = "rating" | "kd" | "adr" | "kast" | "winRate";

/** Média dos últimos `n` mixes contra os `n` anteriores. */
export function formCompare(points: FormPoint[], metric: FormMetric, n = 5) {
  const avg = (xs: FormPoint[]) => {
    if (metric === "winRate") {
      return xs.length ? r2((xs.filter((p) => p.result === "win").length / xs.length) * 100) : null;
    }
    const vals = xs.map((p) => p[metric]).filter((v): v is number => v != null);
    return vals.length ? r2(sum(vals) / vals.length) : null;
  };
  const current = points.slice(-n);
  const previous = points.slice(-2 * n, -n);
  return {
    current: avg(current),
    previous: avg(previous),
    currentCount: current.length,
    previousCount: previous.length,
  };
}

export interface MapRecord {
  mapId: MapId;
  played: number;
  won: number;
  winRate: number;
}

/** Mapas jogados e vencidos pelo jogador (cada mapa da série conta). */
export function mapRecords(mixes: Mix[], playerId: ID): MapRecord[] {
  const acc = new Map<MapId, { played: number; won: number }>();
  for (const mix of mixes) {
    const side = playerSide(mix, playerId);
    if (!side || mix.status !== "finished") continue;
    for (const m of mix.maps) {
      const cur = acc.get(m.mapId) ?? { played: 0, won: 0 };
      cur.played++;
      if (m.winner === side) cur.won++;
      acc.set(m.mapId, cur);
    }
  }
  return [...acc.entries()].map(([mapId, v]) => ({
    mapId,
    played: v.played,
    won: v.won,
    winRate: Math.round((v.won / v.played) * 100),
  }));
}

export interface TimelineMix {
  mixId: string;
  date: string;
  label: string;
  maps: { order: number; mapId: MapId; won: boolean | null; own: number | null; opp: number | null }[];
}

/** Linha do tempo por mapa: cada mix com os mapas jogados e o resultado do jogador em cada um. */
export function mapTimeline(mixes: Mix[], playerId: ID): TimelineMix[] {
  return [...mixes]
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
    .flatMap((mix) => {
      const side = playerSide(mix, playerId);
      if (!side || mix.status !== "finished") return [];
      return [
        {
          mixId: mix.id,
          date: mix.scheduledAt,
          label: mix.name,
          maps: mix.maps.map((m) => ({
            order: m.order,
            mapId: m.mapId,
            won: m.winner == null ? null : m.winner === side,
            own: side === "A" ? m.scoreA : m.scoreB,
            opp: side === "A" ? m.scoreB : m.scoreA,
          })),
        },
      ];
    });
}
