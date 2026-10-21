import "server-only";
import { findMixBySlug, mixSlug } from "@/lib/mix-slug";
import { eloChangeSince } from "@/lib/elo";
import { aggregatePlayer, buildScoreboard, playerMixResult } from "@/lib/stats";
import type { ID, MapId, Player } from "@/types/domain";
import type { Highlights, PlayerMixResult, PlayerProfile, RankingPeriod, RankingRow } from "@/types/views";
import { getDataSource } from "./index";
import { playerSlug } from "@/lib/player-slug";

export const RANKING_PERIODS: Record<RankingPeriod, { label: string; days: number | null }> = {
  "7d": { label: "7 dias", days: 7 },
  "30d": { label: "30 dias", days: 30 },
  "90d": { label: "90 dias", days: 90 },
  all: { label: "Geral", days: null },
};

export function parsePeriod(value: unknown): RankingPeriod {
  return typeof value === "string" && value in RANKING_PERIODS ? (value as RankingPeriod) : "30d";
}

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

function sinceDate(now: Date, period: RankingPeriod) {
  const days = RANKING_PERIODS[period].days;
  return days == null ? null : new Date(now.getTime() - days * 86_400_000);
}

/* -------------------------------- Ranking -------------------------------- */

export async function getRanking({ period = "30d", query = "" }: { period?: RankingPeriod; query?: string } = {}) {
  const ds = getDataSource();
  const [players, elos, mixes, history] = await Promise.all([
    ds.listPlayers(),
    ds.getElos(),
    ds.listMixes({ status: "finished" }),
    ds.getEloHistory(),
  ]);
  const since = sinceDate(ds.now(), period);
  const inPeriod = (iso: string) => !since || new Date(iso) >= since;
  const periodMixes = mixes.filter((m) => inPeriod(m.scheduledAt));

  const rows: RankingRow[] = players
    .map((player) => ({
      position: 0,
      player,
      elo: elos.get(player.id) ?? 0,
      eloChange: eloChangeSince(
        history.filter((h) => h.playerId === player.id),
        since,
      ),
      stats: aggregatePlayer(player.id, periodMixes),
    }))
    .filter((r) => r.stats.mixes > 0)
    .sort((a, b) => b.elo - a.elo || b.stats.winRate - a.stats.winRate)
    .map((r, i) => ({ ...r, position: i + 1 }));

  const q = normalize(query);
  return {
    kind: ds.kind,
    rows: q ? rows.filter((r) => normalize(r.player.nickname).includes(q)) : rows,
    total: rows.length,
  };
}

/* -------------------------------- Jogador -------------------------------- */

export async function searchPlayers(query: string) {
  const ds = getDataSource();
  const [players, elos] = await Promise.all([ds.listPlayers(), ds.getElos()]);
  const q = normalize(query);
  return players
    .filter((p) => !q || normalize(p.nickname).includes(q))
    .map((player) => ({ player, elo: elos.get(player.id) ?? 0 }))
    .sort((a, b) => b.elo - a.elo);
}

export async function getPlayerProfile(id: ID): Promise<PlayerProfile | null> {
  const ds = getDataSource();
  const player = await ds.getPlayer(id);
  if (!player) return null;

  const [elos, mixes, eloHistory] = await Promise.all([
    ds.getElos(),
    ds.listMixes({ playerId: id, status: "finished" }),
    ds.getEloHistory(id),
  ]);
  const ordered = [...elos.entries()].sort((a, b) => b[1] - a[1]);
  const index = ordered.findIndex(([pid]) => pid === id);

  return {
    player,
    elo: elos.get(id) ?? 0,
    position: index >= 0 ? index + 1 : null,
    totalPlayers: ordered.length,
    stats: aggregatePlayer(id, mixes),
    eloHistory,
    recentMixes: mixes.map((m) => playerMixResult(m, id)).filter((r): r is PlayerMixResult => r !== null),
  };
}

/** Destaques individuais com base nos mixes recentes do jogador. */
export function getPlayerHighlights(profile: PlayerProfile, window = 10): Highlights {
  const recent = profile.recentMixes.slice(0, window);
  const lastMvpMix = profile.recentMixes.find((r) => r.isMvp)?.mix ?? null;
  const bestRecent = [...recent].sort((a, b) => b.kills - b.deaths - (a.kills - a.deaths))[0] ?? null;
  const agg = aggregatePlayer(
    profile.player.id,
    recent.map((r) => r.mix),
  );
  return {
    lastMvp: lastMvpMix ? { mix: lastMvpMix, player: profile.player } : null,
    bestRecent,
    clutchesWon: agg.clutchesWon,
    firstKills: agg.firstKills,
  };
}

/* --------------------------------- Mixes --------------------------------- */

export async function listMixes() {
  const ds = getDataSource();
  const [mixes, players] = await Promise.all([ds.listMixes(), ds.listPlayers()]);
  return { kind: ds.kind, mixes, players: new Map(players.map((p) => [p.id, p])) };
}

/** Mix pelo id ou pelo endereço amigável (/mixes/outubro13). */
export async function getMixDetail(idOrSlug: ID) {
  const ds = getDataSource();
  const param = decodeURIComponent(idOrSlug);
  const all = await ds.listMixes();
  const mix = (await ds.getMix(param)) ?? findMixBySlug(param, all);
  if (!mix) return null;
  const id = mix.id;
  const [players, highlights] = await Promise.all([ds.listPlayers(), ds.listHighlights()]);
  const byId = new Map(players.map((p) => [p.id, p]));
  return {
    kind: ds.kind,
    mix,
    slug: mixSlug(mix, all),
    players: byId,
    scoreboard: buildScoreboard(mix, byId),
    mapScoreboards: mix.maps.map((m) => ({ map: m, rows: buildScoreboard(mix, byId, m.order) })),
    highlights: highlights.filter((h) => h.mixId === id),
  };
}

/* ------------------------------- Dashboard ------------------------------- */

export async function getDashboard() {
  const ds = getDataSource();
  const playerId = await ds.getCurrentPlayerId();
  const profile = playerId ? await getPlayerProfile(playerId) : null;
  if (!profile) return { kind: ds.kind, profile: null, highlights: null, players: new Map<ID, Player>() };
  const players = await ds.listPlayers();
  const highlights = getPlayerHighlights(profile);
  return { kind: ds.kind, profile, highlights, players: new Map(players.map((p) => [p.id, p])) };
}

/* ----------------------------- Estatísticas ------------------------------ */

export async function getCommunityStats() {
  const ds = getDataSource();
  const [mixes, players, community] = await Promise.all([
    ds.listMixes({ status: "finished" }),
    ds.listPlayers(),
    ds.getCommunity(),
  ]);
  const maps = new Map<MapId, { played: number; rounds: number; sideAWins: number }>();
  for (const mix of mixes) {
    for (const m of mix.maps) {
      const entry = maps.get(m.mapId) ?? { played: 0, rounds: 0, sideAWins: 0 };
      entry.played += 1;
      entry.rounds += (m.scoreA ?? 0) + (m.scoreB ?? 0);
      if (m.winner === "A") entry.sideAWins += 1;
      maps.set(m.mapId, entry);
    }
  }
  // Mínimo de mixes para entrar nos líderes: 3, ou menos enquanto a comunidade jogou poucos.
  const minMixes = Math.min(3, Math.max(1, mixes.length));
  const leaders = players
    .map((player) => ({ player, stats: aggregatePlayer(player.id, mixes) }))
    .filter((r) => r.stats.mixes >= minMixes);

  return {
    kind: ds.kind,
    community,
    totals: {
      mixes: mixes.length,
      maps: mixes.reduce((s, m) => s + m.maps.length, 0),
      rounds: [...maps.values()].reduce((s, m) => s + m.rounds, 0),
      players: players.length,
    },
    maps: [...maps.entries()].map(([mapId, v]) => ({ mapId, ...v })).sort((a, b) => b.played - a.played),
    leaders,
    minMixes,
  };
}

export async function getHighlightsFeed() {
  const ds = getDataSource();
  const [highlights, mixes, players] = await Promise.all([ds.listHighlights(), ds.listMixes(), ds.listPlayers()]);
  return {
    kind: ds.kind,
    highlights,
    mixes: new Map(mixes.map((m) => [m.id, m])),
    players: new Map(players.map((p) => [p.id, p])),
  };
}

/** Perfil pelo id ou pelo nick do endereço (/jogadores/barker). */
export async function resolvePlayerProfile(idOrSlug: string): Promise<PlayerProfile | null> {
  const param = decodeURIComponent(idOrSlug);
  const direct = /^[0-9a-f-]{36}$/i.test(param) || !/^[a-z0-9-]+$/.test(param) ? await getPlayerProfile(param) : null;
  if (direct) return direct;
  const slug = playerSlug(param);
  const match = (await getDataSource().listPlayers()).find((p) => playerSlug(p.nickname) === slug || p.id === param);
  return match ? getPlayerProfile(match.id) : null;
}
