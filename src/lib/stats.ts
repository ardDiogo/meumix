import type { ID, Mix, Player, PlayerMapStats, TeamSide } from "@/types/domain";
import type { PlayerAggregate, PlayerMixResult, ScoreboardRow } from "@/types/views";

/* --------------------------------- Mix ---------------------------------- */

export function mapsWon(mix: Mix, side: TeamSide) {
  return mix.maps.filter((m) => m.winner === side).length;
}

/** Vencedor da série (BO1/BO3) ou `null` em caso de empate / não finalizado. */
export function seriesWinner(mix: Mix): TeamSide | null {
  if (mix.status !== "finished") return null;
  const a = mapsWon(mix, "A");
  const b = mapsWon(mix, "B");
  if (a === b) return null;
  return a > b ? "A" : "B";
}

/** Placar exibido: rounds se for mapa único, mapas vencidos se for série. */
export function seriesScore(mix: Mix): [number, number] | null {
  if (mix.status !== "finished") return null;
  if (mix.maps.length === 1) {
    const [m] = mix.maps;
    return m && m.scoreA != null && m.scoreB != null ? [m.scoreA, m.scoreB] : null;
  }
  return [mapsWon(mix, "A"), mapsWon(mix, "B")];
}

export function playerSide(mix: Mix, playerId: ID): TeamSide | null {
  return mix.teams.find((t) => t.playerIds.includes(playerId))?.side ?? null;
}

export function playerResult(mix: Mix, playerId: ID): "win" | "loss" | "draw" | null {
  const side = playerSide(mix, playerId);
  if (!side || mix.status !== "finished") return null;
  const winner = seriesWinner(mix);
  if (winner == null) return "draw";
  return winner === side ? "win" : "loss";
}

/* ------------------------------ Agregações ------------------------------- */

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const ratio = (a: number, b: number) => (b === 0 ? a : a / b);
const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

/** Soma campos opcionais apenas quando todas as linhas os possuem. */
function sumOptional(rows: PlayerMapStats[], pick: (r: PlayerMapStats) => number | undefined) {
  const values = rows.map(pick);
  return values.every((v) => v != null) ? sum(values as number[]) : null;
}

function adrOf(rows: PlayerMapStats[]) {
  const withDamage = rows.filter((r) => r.damage != null && r.roundsPlayed);
  if (!withDamage.length) return null;
  return round(sum(withDamage.map((r) => r.damage!)) / sum(withDamage.map((r) => r.roundsPlayed!)), 1);
}

function kastOf(rows: PlayerMapStats[]) {
  const withKast = rows.filter((r) => r.kastRounds != null && r.roundsPlayed);
  if (!withKast.length) return null;
  return round((sum(withKast.map((r) => r.kastRounds!)) / sum(withKast.map((r) => r.roundsPlayed!))) * 100, 1);
}

/** "Lanterna": terminou o mix com o pior saldo (K − D) entre todos os jogadores. */
export function isLantern(mix: Mix, playerId: ID) {
  const diffs = new Map<ID, number>();
  for (const s of mix.stats) diffs.set(s.playerId, (diffs.get(s.playerId) ?? 0) + s.kills - s.deaths);
  const mine = diffs.get(playerId);
  return mine != null && diffs.size > 1 && mine === Math.min(...diffs.values());
}

export function statsForPlayer(mix: Mix, playerId: ID) {
  return mix.stats.filter((s) => s.playerId === playerId);
}

export function emptyAggregate(): PlayerAggregate {
  return {
    mixes: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    winRate: 0,
    kills: 0,
    assists: 0,
    deaths: 0,
    kd: 0,
    adr: null,
    kast: null,
    firstKills: 0,
    clutchesWon: 0,
    mvps: 0,
    lanterns: 0,
  };
}

/** Agrega o desempenho de um jogador nos mixes finalizados informados. */
export function aggregatePlayer(playerId: ID, mixes: Mix[]): PlayerAggregate {
  const played = mixes.filter((m) => m.status === "finished" && playerSide(m, playerId));
  if (!played.length) return emptyAggregate();

  const rows = played.flatMap((m) => statsForPlayer(m, playerId));
  const results = played.map((m) => playerResult(m, playerId));
  const wins = results.filter((r) => r === "win").length;
  const losses = results.filter((r) => r === "loss").length;
  const kills = sum(rows.map((r) => r.kills));
  const deaths = sum(rows.map((r) => r.deaths));

  return {
    mixes: played.length,
    wins,
    losses,
    draws: played.length - wins - losses,
    winRate: round((wins / played.length) * 100, 1),
    kills,
    assists: sum(rows.map((r) => r.assists)),
    deaths,
    kd: round(ratio(kills, deaths)),
    adr: adrOf(rows),
    kast: kastOf(rows),
    firstKills: sum(rows.map((r) => r.firstKills ?? 0)),
    clutchesWon: sum(rows.map((r) => r.clutchesWon ?? 0)),
    mvps: played.filter((m) => m.mvpPlayerId === playerId).length,
    lanterns: played.filter((m) => isLantern(m, playerId)).length,
  };
}

export function playerMixResult(mix: Mix, playerId: ID): PlayerMixResult | null {
  const side = playerSide(mix, playerId);
  const result = playerResult(mix, playerId);
  if (!side || !result) return null;
  const rows = statsForPlayer(mix, playerId);
  return {
    mix,
    side,
    result,
    kills: sum(rows.map((r) => r.kills)),
    assists: sum(rows.map((r) => r.assists)),
    deaths: sum(rows.map((r) => r.deaths)),
    adr: adrOf(rows),
    isMvp: mix.mvpPlayerId === playerId,
  };
}

/* ------------------------------- Placar --------------------------------- */

/**
 * Monta as linhas do placar de um mix (todos os mapas ou um mapa específico).
 * Métricas sem dados registrados ficam `null` e são exibidas como "—".
 */
export function buildScoreboard(mix: Mix, players: Map<ID, Player>, mapOrder?: number): ScoreboardRow[] {
  const rows: ScoreboardRow[] = [];
  for (const team of mix.teams) {
    for (const playerId of team.playerIds) {
      const player = players.get(playerId);
      if (!player) continue;
      const stats = statsForPlayer(mix, playerId).filter((s) => mapOrder == null || s.mapOrder === mapOrder);
      if (!stats.length) continue;

      const kills = sum(stats.map((s) => s.kills));
      const deaths = sum(stats.map((s) => s.deaths));
      const hs = sumOptional(stats, (s) => s.headshotKills);
      const mk = sumOptional(stats, (s) =>
        s.multikills ? s.multikills.k3 + s.multikills.k4 + s.multikills.k5 : undefined,
      );
      const cw = sumOptional(stats, (s) => s.clutchesWon);
      const cp = sumOptional(stats, (s) => s.clutchesPlayed);

      rows.push({
        player,
        side: team.side,
        kills,
        assists: sum(stats.map((s) => s.assists)),
        deaths,
        diff: kills - deaths,
        kd: round(ratio(kills, deaths)),
        adr: adrOf(stats),
        kast: kastOf(stats),
        hsPercent: hs == null || kills === 0 ? null : round((hs / kills) * 100, 0),
        firstKills: sumOptional(stats, (s) => s.firstKills),
        firstDeaths: sumOptional(stats, (s) => s.firstDeaths),
        multikills: mk,
        clutches: cw == null || cp == null ? null : `${cw}/${cp}`,
      });
    }
  }
  return rows.sort((a, b) => (a.side === b.side ? b.kills - a.kills || a.deaths - b.deaths : a.side < b.side ? -1 : 1));
}
