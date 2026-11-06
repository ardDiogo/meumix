import "server-only";
import { cache } from "react";
import {
  canCreateChampionship,
  canManageChampionship,
  type Championship,
  type ChampionshipPlayer,
  type ChampionshipTeam,
} from "@/lib/championship";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSession } from "./auth";
import { getDataSource } from "./index";

/** Colunas lidas nas listas e na página (a capa vai à parte, pela rota da imagem). */
export const CHAMPIONSHIP_COLUMNS =
  "id, slug, name, description, edition, has_banner, starts_on, ends_on, team_count, players_per_team, pot_count, group_format, group_best_of, points_win, points_loss, playoff_format, playoff_best_of, match_days, window_start, window_end, servers, entry_fee, prize_split, costs, status, created_by, created_at, updated_at";

type Row = Record<string, unknown>;

export function toChampionship(r: Row): Championship {
  return {
    id: r.id as string,
    slug: r.slug as string,
    name: r.name as string,
    description: (r.description as string) ?? "",
    edition: (r.edition as string) ?? "",
    hasBanner: !!r.has_banner,
    startsOn: (r.starts_on as string | null) ?? null,
    endsOn: (r.ends_on as string | null) ?? null,
    teamCount: Number(r.team_count),
    playersPerTeam: Number(r.players_per_team),
    potCount: Number(r.pot_count),
    groupFormat: r.group_format as Championship["groupFormat"],
    groupBestOf: Number(r.group_best_of),
    pointsWin: Number(r.points_win),
    pointsLoss: Number(r.points_loss),
    playoffFormat: r.playoff_format as Championship["playoffFormat"],
    playoffBestOf: Number(r.playoff_best_of),
    matchDays: ((r.match_days as number[]) ?? []).map(Number),
    windowStart: String(r.window_start ?? "").slice(0, 5),
    windowEnd: String(r.window_end ?? "").slice(0, 5),
    servers: Number(r.servers),
    entryFee: Number(r.entry_fee),
    prizeSplit: ((r.prize_split as (number | string)[]) ?? []).map(Number),
    costs: Number(r.costs),
    status: r.status as Championship["status"],
    createdBy: (r.created_by as string | null) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

/** Sem a migração 0038: lista vazia e a página avisa o admin. */
export async function listChampionships(): Promise<{ list: Championship[]; missing: boolean }> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { list: [], missing: false };
  const { data, error } = await supabase
    .from("championships")
    .select(CHAMPIONSHIP_COLUMNS)
    .order("starts_on", { ascending: false, nullsFirst: true })
    .order("created_at", { ascending: false });
  if (error) return { list: [], missing: error.code === "42P01" || error.code === "PGRST205" };
  return { list: (data ?? []).map(toChampionship), missing: false };
}

export interface Organizer {
  userId: string;
  nickname: string;
  avatarUrl: string | null;
}

/** Campeonato pelo endereço, com os organizadores e o que a pessoa logada pode fazer. */
export const getChampionship = cache(async (slug: string) => {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return null;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("championships")
    .select(CHAMPIONSHIP_COLUMNS)
    .eq("slug", slug)
    .maybeSingle();
  if (error || !data) return null;
  const championship = toChampionship(data);
  const [{ data: orgs }, session, players] = await Promise.all([
    supabase.from("championship_organizers").select("user_id").eq("championship_id", championship.id),
    getSession(),
    getDataSource().listPlayers(),
  ]);
  const byId = new Map(players.map((p) => [p.id, p]));
  const organizers: Organizer[] = (orgs ?? []).map((o) => {
    const p = byId.get(o.user_id as string);
    return { userId: o.user_id as string, nickname: p?.nickname ?? "Jogador", avatarUrl: p?.avatarUrl ?? null };
  });
  const canManage = canManageChampionship(
    session,
    championship,
    organizers.map((o) => o.userId),
  );
  return {
    championship,
    organizers,
    session,
    canManage,
    players,
    canGrant: !!session?.isSuperAdmin,
    canDelete: !!session && (session.isSuperAdmin || championship.createdBy === session.id),
  };
});

export async function canCreate() {
  return canCreateChampionship(await getSession());
}

/** Times e inscritos do campeonato (sem a migração 0038: vazio). */
export const getRoster = cache(async (championshipId: string) => {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { teams: [] as ChampionshipTeam[], players: [] as ChampionshipPlayer[] };
  const [{ data: teams }, { data: players }] = await Promise.all([
    supabase
      .from("championship_teams")
      .select("id, name, tag, color, has_logo, captain_id, draft_order, created_at")
      .eq("championship_id", championshipId)
      .order("draft_order", { nullsFirst: false })
      .order("created_at"),
    supabase
      .from("championship_players")
      .select("user_id, pot, team_id, created_at")
      .eq("championship_id", championshipId)
      .order("created_at"),
  ]);
  return {
    teams: (teams ?? []).map((t): ChampionshipTeam => ({
      id: t.id as string,
      name: t.name as string,
      tag: (t.tag as string) ?? "",
      color: t.color as string,
      hasLogo: !!t.has_logo,
      captainId: (t.captain_id as string | null) ?? null,
      draftOrder: (t.draft_order as number | null) ?? null,
    })),
    players: (players ?? []).map((p): ChampionshipPlayer => ({
      userId: p.user_id as string,
      pot: (p.pot as number | null) ?? null,
      teamId: (p.team_id as string | null) ?? null,
    })),
  };
});

export interface AdedonhaRound {
  round: number;
  startTeam: string;
  remaining: string[];
  played: string[];
  revealed: Record<string, number> | null;
  total: number | null;
  pickedTeam: string | null;
  resolvedAt: string | null;
}

export interface PickRow {
  id: string;
  pickNo: number;
  pot: number;
  teamId: string;
  userId: string;
  pickedBy: string | null;
  createdAt: string;
  undoneAt: string | null;
}

/** Draft do campeonato: andamento, rodadas da adedonha e escolhas (com as desfeitas). */
export const getDraft = cache(async (championshipId: string) => {
  const supabase = await createSupabaseServerClient();
  const empty = {
    status: null as "order" | "picking" | "done" | null,
    rounds: [] as AdedonhaRound[],
    picks: [] as PickRow[],
    missing: false,
  };
  if (!supabase) return empty;
  const [{ data: draft, error }, { data: rounds }, { data: picks }] = await Promise.all([
    supabase.from("championship_drafts").select("status").eq("championship_id", championshipId).maybeSingle(),
    supabase
      .from("championship_adedonha_rounds")
      .select("round, start_team, remaining, played, revealed, total, picked_team, resolved_at")
      .eq("championship_id", championshipId)
      .order("round"),
    supabase
      .from("championship_picks")
      .select("id, pick_no, pot, team_id, user_id, picked_by, created_at, undone_at")
      .eq("championship_id", championshipId)
      .order("created_at"),
  ]);
  if (error) return { ...empty, missing: error.code === "42P01" || error.code === "PGRST205" };
  return {
    status: (draft?.status as "order" | "picking" | "done" | undefined) ?? null,
    missing: false,
    rounds: (rounds ?? []).map((r): AdedonhaRound => ({
      round: r.round as number,
      startTeam: r.start_team as string,
      remaining: (r.remaining as string[]) ?? [],
      played: (r.played as string[]) ?? [],
      revealed: (r.revealed as Record<string, number> | null) ?? null,
      total: (r.total as number | null) ?? null,
      pickedTeam: (r.picked_team as string | null) ?? null,
      resolvedAt: (r.resolved_at as string | null) ?? null,
    })),
    picks: (picks ?? []).map((p): PickRow => ({
      id: p.id as string,
      pickNo: p.pick_no as number,
      pot: p.pot as number,
      teamId: p.team_id as string,
      userId: p.user_id as string,
      pickedBy: (p.picked_by as string | null) ?? null,
      createdAt: p.created_at as string,
      undoneAt: (p.undone_at as string | null) ?? null,
    })),
  };
});
