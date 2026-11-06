import "server-only";
import { cache } from "react";
import type { Championship } from "@/lib/championship";
import { seriesState, standings } from "@/lib/championship-standings";
import { finalPlacing } from "@/lib/championship-stats";
import { aggregateGc } from "@/lib/gc-analysis";
import { getChampionshipGc, getMapResults, getMatches, getRoster } from "./championships";

/**
 * Tudo o que as páginas de resumo usam (visão geral, estatísticas,
 * premiação, jogador): times, jogos, placares, classificação, colocação
 * final e as estatísticas da GC por jogador. Só dados do campeonato.
 */
export const getSummary = cache(async (c: Championship) => {
  const [{ teams, players }, { matches }, { maps }, gc] = await Promise.all([
    getRoster(c.id),
    getMatches(c.id),
    getMapResults(c.id),
    getChampionshipGc(c.id),
  ]);
  const mapsOf = (matchId: string) => maps.filter((x) => x.matchId === matchId).sort((a, b) => a.order - b.order);
  const group = matches.filter((m) => m.stage === "group");
  const table = standings(
    teams.map((t) => t.id),
    group
      .filter((m) => m.homeTeam && m.awayTeam)
      .map((m) => ({ home: m.homeTeam!, away: m.awayTeam!, bestOf: m.bestOf, maps: mapsOf(m.id) })),
    { pointsWin: c.pointsWin, pointsLoss: c.pointsLoss },
  );
  const placing = finalPlacing(
    c.playoffFormat,
    table.map((r) => r.team),
    matches.map((m) => ({
      stage: m.stage,
      round: m.round,
      homeTeam: m.homeTeam,
      awayTeam: m.awayTeam,
      winnerTeam: m.winnerTeam,
    })),
  );
  // Por equipe, em todos os jogos decididos (classificatória e playoffs).
  const teamTotals = teams.map((t) => {
    let played = 0;
    let wins = 0;
    let roundsWon = 0;
    let roundsLost = 0;
    for (const m of matches) {
      if (!m.winnerTeam || (m.homeTeam !== t.id && m.awayTeam !== t.id)) continue;
      const home = m.homeTeam === t.id;
      played++;
      if (m.winnerTeam === t.id) wins++;
      for (const x of mapsOf(m.id)) {
        roundsWon += home ? x.home : x.away;
        roundsLost += home ? x.away : x.home;
      }
    }
    return { team: t, played, wins, roundsWon, roundsLost, efficiency: played ? Math.round((wins / played) * 100) : 0 };
  });
  const finished = matches.filter((m) => m.status === "finished").length;
  const active = matches.filter((m) => m.status !== "cancelled").length;
  const score = (matchId: string, bestOf: number) => {
    const mine = mapsOf(matchId);
    if (!mine.length) return null;
    if (bestOf === 1) return { home: mine[0]!.home, away: mine[0]!.away };
    const s = seriesState(mine, bestOf);
    return { home: s.home, away: s.away };
  };
  return {
    teams,
    players,
    matches,
    maps,
    gc,
    lines: aggregateGc(gc.map((g) => g.data)).filter((l) => l.userId),
    table,
    placing,
    teamTotals,
    progress: { finished, total: active },
    score,
    mapsOf,
  };
});
