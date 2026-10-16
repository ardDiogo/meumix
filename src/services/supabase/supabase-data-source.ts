import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { DataSource, ListMixesOptions } from "@/services/data-source";
import type {
  Community,
  EloHistoryEntry,
  MapId,
  MapResult,
  Mix,
  Player,
  PlayerMapStats,
  TeamSide,
} from "@/types/domain";
import { getSession } from "../auth";

/**
 * Dados reais (Supabase). Cada partida finalizada (`mix_matches`) vira um `Mix`;
 * as estatísticas por jogador ficam agregadas na partida (mapOrder 0).
 */

interface MatchRow {
  id: string;
  schedule_id: string | null;
  event_date: string;
  maps: { map_id: string; score_a: number; score_b: number }[];
  team_a_name: string | null;
  team_b_name: string | null;
  finalized_at: string;
}

interface RecordRow {
  match_id: string;
  user_id: string | null;
  player_name: string;
  team: TeamSide;
  kills: number;
  deaths: number;
  assists: number;
  first_kills: number;
  adr: number | null;
  kast: number | null;
  is_mvp: boolean;
}

async function client() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new Error("Supabase não configurado.");
  return supabase;
}

function toMix(match: MatchRow, records: RecordRow[], names: Map<string, string>): Mix {
  const maps: MapResult[] = match.maps.map((m, i) => ({
    order: i + 1,
    mapId: m.map_id as MapId,
    scoreA: m.score_a,
    scoreB: m.score_b,
    winner: m.score_a === m.score_b ? null : m.score_a > m.score_b ? "A" : "B",
  }));
  const rounds = maps.reduce((s, m) => s + (m.scoreA ?? 0) + (m.scoreB ?? 0), 0);
  const linked = records.filter((r) => r.user_id);
  const side = (s: TeamSide) => linked.filter((r) => r.team === s).map((r) => r.user_id!);
  const teamName = (s: TeamSide, custom: string | null) => {
    const first = side(s)[0];
    return custom || (first ? `Time ${names.get(first) ?? "?"}` : `Time ${s}`);
  };
  const stats: PlayerMapStats[] = linked.map((r) => ({
    playerId: r.user_id!,
    mapOrder: 0,
    side: r.team,
    kills: r.kills,
    assists: r.assists,
    deaths: r.deaths,
    firstKills: r.first_kills,
    ...(r.adr != null && rounds ? { roundsPlayed: rounds, damage: Math.round(Number(r.adr) * rounds) } : {}),
    ...(r.kast != null && rounds ? { roundsPlayed: rounds, kastRounds: Math.round((Number(r.kast) / 100) * rounds) } : {}),
  }));
  const [d, mo] = [match.event_date.slice(8, 10), match.event_date.slice(5, 7)];
  return {
    id: match.id,
    communityId: "principal",
    name: `Mix de ${d}/${mo}`,
    scheduledAt: `${match.event_date}T23:00:00Z`,
    status: "finished",
    organizerIds: [],
    teams: [
      { side: "A", name: teamName("A", match.team_a_name), captainId: side("A")[0] ?? null, playerIds: side("A") },
      { side: "B", name: teamName("B", match.team_b_name), captainId: side("B")[0] ?? null, playerIds: side("B") },
    ],
    maps,
    stats,
    mvpPlayerId: linked.find((r) => r.is_mvp)?.user_id ?? null,
    twitchUrl: null,
    highlightIds: [],
  };
}

async function loadMixes(filter?: { id?: string; playerId?: string }) {
  const supabase = await client();
  let matchIds: string[] | null = null;
  if (filter?.playerId) {
    const { data } = await supabase.from("player_match_records").select("match_id").eq("user_id", filter.playerId);
    matchIds = (data ?? []).map((r) => r.match_id as string);
    if (!matchIds.length) return [];
  }
  let query = supabase.from("mix_matches").select("*").order("event_date", { ascending: false });
  if (filter?.id) query = query.eq("id", filter.id);
  if (matchIds) query = query.in("id", matchIds);
  const { data: matches, error } = await query;
  if (error) throw new Error(`Falha ao carregar partidas: ${error.message}`);
  if (!matches?.length) return [];

  const [{ data: records }, { data: profiles }] = await Promise.all([
    supabase
      .from("player_match_records")
      .select("match_id, user_id, player_name, team, kills, deaths, assists, first_kills, adr, kast, is_mvp")
      .in(
        "match_id",
        matches.map((m) => m.id),
      ),
    supabase.from("profiles").select("id, display_name"),
  ]);
  const names = new Map((profiles ?? []).map((p) => [p.id as string, p.display_name as string]));
  return (matches as MatchRow[]).map((m) =>
    toMix(
      m,
      ((records ?? []) as RecordRow[]).filter((r) => r.match_id === m.id),
      names,
    ),
  );
}

export const supabaseDataSource: DataSource = {
  kind: "supabase",
  now: () => new Date(),

  async getCommunity(): Promise<Community> {
    const supabase = await client();
    const { data } = await supabase.from("communities").select("*").eq("slug", "principal").maybeSingle();
    return {
      id: data?.id ?? "principal",
      slug: data?.slug ?? "principal",
      name: data?.name ?? "MeuMix",
      description: data?.description ?? undefined,
      startingElo: 0,
      createdAt: data?.created_at ?? new Date().toISOString(),
    };
  },

  async getCurrentPlayerId() {
    return (await getSession())?.id ?? null;
  },

  async listPlayers(): Promise<Player[]> {
    const supabase = await client();
    const { data } = await supabase.from("profiles").select("id, display_name, faceit_player_id, created_at");
    return (data ?? []).map((p) => ({
      id: p.id as string,
      nickname: p.display_name as string,
      avatarUrl: null,
      steamId: null,
      createdAt: p.created_at as string,
    }));
  },

  async getPlayer(id) {
    const supabase = await client();
    const { data: p } = await supabase.from("profiles").select("id, display_name, created_at").eq("id", id).maybeSingle();
    return p
      ? { id: p.id as string, nickname: p.display_name as string, avatarUrl: null, steamId: null, createdAt: p.created_at as string }
      : null;
  },

  async getElos() {
    const supabase = await client();
    const { data } = await supabase.from("profiles").select("id, elo");
    return new Map((data ?? []).map((p) => [p.id as string, p.elo as number]));
  },

  async listMixes({ playerId, status, limit }: ListMixesOptions = {}) {
    const statuses = status == null ? null : Array.isArray(status) ? status : [status];
    if (statuses && !statuses.includes("finished")) return [];
    const mixes = await loadMixes({ playerId });
    return limit ? mixes.slice(0, limit) : mixes;
  },

  async getMix(id) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    return (await loadMixes({ id }))[0] ?? null;
  },

  async getEloHistory(playerId) {
    const supabase = await client();
    let query = supabase
      .from("elo_change_logs")
      .select("user_id, match_id, old_elo, new_elo, created_at")
      .order("created_at", { ascending: true });
    if (playerId) query = query.eq("user_id", playerId);
    const { data } = await query;
    const { data: records } = await supabase.from("player_match_records").select("match_id, user_id, wins, losses");
    const result = new Map(
      (records ?? []).map((r) => [
        `${r.match_id}:${r.user_id}`,
        (r.wins as number) > (r.losses as number) ? "win" : (r.wins as number) < (r.losses as number) ? "loss" : "draw",
      ]),
    );
    return (data ?? []).map(
      (h): EloHistoryEntry => ({
        playerId: h.user_id as string,
        communityId: "principal",
        mixId: (h.match_id as string) ?? "",
        date: h.created_at as string,
        eloBefore: h.old_elo as number,
        eloAfter: h.new_elo as number,
        result: (result.get(`${h.match_id}:${h.user_id}`) as EloHistoryEntry["result"]) ?? "draw",
      }),
    );
  },

  async listHighlights() {
    return [];
  },
};
