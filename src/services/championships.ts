import "server-only";
import { cache } from "react";
import { canCreateChampionship, canManageChampionship, type Championship } from "@/lib/championship";
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
