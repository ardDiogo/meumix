import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { canManageMixes, isPlatformAdmin } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { LEAGUE_COOKIE, leagueLabel, type League } from "@/lib/league";
import { initialEloFromGc, levelForElo } from "@/lib/levels";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSession } from "./auth";
import { getLevels } from "./levels";
import { profileAvatars } from "./avatars";

/**
 * Ligas (Mix da Lanterna às segundas, Mix do Jantinha às terças…). Cada uma tem seus mixes, ELO, ranking e
 * estatísticas. A liga atual vem do cookie (seletor do topo), de `?liga=` em páginas
 * que aceitam (perfil) ou, na falta, da liga em que a pessoa joga.
 * Sem as migrações 0045/0046, `null`: o site funciona como antes (uma comunidade só).
 */

type Row = { id: string; slug: string; name: string; weekday: number | null; sort_order: number | null };

/** Todas as ligas, em ordem. `null` sem as migrações. */
export const listLeagues = cache(async (): Promise<League[] | null> => {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const [{ data, error }, members] = await Promise.all([
    supabase.from("communities").select("id, slug, name, weekday, sort_order").order("sort_order"),
    supabase.from("league_members").select("league_id", { head: true, count: "exact" }),
  ]);
  if (error || members.error || !data?.length) return null;
  return (data as Row[]).map((r) => ({
    id: r.id,
    slug: r.slug,
    name: leagueLabel(r.slug, r.name),
    weekday: r.weekday,
  }));
});

/** Ligas em que a pessoa logada joga (membro ativo). */
export const myLeagueIds = cache(async (): Promise<Set<string>> => {
  const session = await getSession();
  const supabase = await createSupabaseServerClient();
  if (!session || !supabase) return new Set();
  const active = await supabase.from("league_members").select("league_id").eq("user_id", session.id).eq("active", true);
  // Sem a migração 0049 (sem a coluna active): todos os vínculos.
  const { data } = active.error
    ? await supabase.from("league_members").select("league_id").eq("user_id", session.id)
    : active;
  return new Set((data ?? []).map((r) => r.league_id as string));
});

/**
 * Ligas que a pessoa pode ver: admin da plataforma vê todas; os outros, só as
 * ligas em que são membros. Sem login ou sem liga: nenhuma.
 */
export const visibleLeagues = cache(async (): Promise<League[]> => {
  const leagues = (await listLeagues()) ?? [];
  const session = await getSession();
  if (!session) return [];
  if (isPlatformAdmin(session)) return leagues;
  const mine = await myLeagueIds();
  return leagues.filter((l) => mine.has(l.id));
});

/**
 * "Liga" de quem não participa de nenhuma: as consultas filtram por ela e voltam
 * vazias (nada de nenhuma liga aparece).
 */
export const NO_LEAGUE: League = {
  id: "00000000-0000-0000-0000-000000000000",
  slug: "sem-liga",
  name: "Sem liga",
  weekday: null,
  none: true,
};

/**
 * Liga das consultas só nesta requisição (ex.: aba do perfil: um slug ou "geral").
 * Não muda o seletor do topo.
 */
const override = cache(() => ({ slug: null as string | null }));

export function setRequestLeague(slug: string | null | undefined) {
  override().slug = slug ?? null;
}

/** Liga atual (a do seletor do topo). `null` sem as migrações das ligas. */
export async function getCurrentLeague(): Promise<League | null> {
  const leagues = await listLeagues();
  if (!leagues) return null;
  const visible = await visibleLeagues();
  if (!visible.length) return NO_LEAGUE;
  const wanted = (await cookies()).get(LEAGUE_COOKIE)?.value ?? null;
  const chosen = wanted ? visible.find((l) => l.slug === wanted) : undefined;
  if (chosen) return chosen;
  const mine = await myLeagueIds();
  return visible.find((l) => mine.has(l.id)) ?? visible[0]!;
}

/** Liga de uma agenda de mix (para finalizar, sugerir times e mostrar o ELO certo). */
export async function leagueOfSchedule(scheduleId: string | null | undefined): Promise<string | null> {
  const leagues = await listLeagues();
  if (!leagues) return null;
  const supabase = await createSupabaseServerClient();
  if (!supabase || !scheduleId) return leagues[0]?.id ?? null;
  const { data } = await supabase.from("mix_schedules").select("community_id").eq("id", scheduleId).maybeSingle();
  return (data?.community_id as string | undefined) ?? leagues[0]?.id ?? null;
}

/** ELO de cada jogador numa liga (sem as migrações: o ELO de `profiles`). */
export async function leagueElos(leagueId: string | null): Promise<Map<string, number>> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return new Map();
  if (!leagueId) {
    const { data } = await supabase.from("profiles").select("id, elo");
    return new Map((data ?? []).map((p) => [p.id as string, p.elo as number]));
  }
  const { data } = await supabase.from("league_members").select("user_id, elo").eq("league_id", leagueId);
  return new Map((data ?? []).map((p) => [p.user_id as string, p.elo as number]));
}

/**
 * O que as consultas devem filtrar: uma liga, "all" (aba Geral do perfil: todos os
 * mixes, sem ELO) ou `null` (sem as migrações: comportamento antigo).
 */
export async function leagueScope(): Promise<League | "all" | null> {
  const slug = override().slug;
  if (slug) {
    const leagues = await listLeagues();
    if (leagues && slug === "geral") return "all";
    // Quem chama já validou o slug (aba do perfil, liga do mix).
    const chosen = leagues?.find((l) => l.slug === slug);
    if (chosen) return chosen;
  }
  return getCurrentLeague();
}

/** Ligas em que um jogador joga (entre as que quem vê pode ver). */
export async function playerLeagues(userId: string): Promise<League[]> {
  const supabase = await createSupabaseServerClient();
  if (!supabase || !(await listLeagues())) return [];
  const ids = new Set((await activeLeagueIdsOf(userId)) ?? []);
  return (await visibleLeagues()).filter((l) => ids.has(l.id));
}

type AnyClient = NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;

/**
 * ELO e nível destes jogadores numa liga. Quem ainda não jogou nela começa no ELO
 * inicial do nível GC (a mesma regra do banco). Sem ligas: o ELO de `profiles`.
 */
export async function eloInLeague(
  client: AnyClient,
  leagueId: string | null,
  ids: string[],
): Promise<Map<string, { elo: number; level: number }>> {
  const out = new Map<string, { elo: number; level: number }>();
  if (!ids.length) return out;
  // Em lotes: listas grandes de ids estouram o tamanho do endereço da consulta.
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 150) chunks.push(ids.slice(i, i + 150));
  const [profileChunks, levels] = await Promise.all([
    Promise.all(chunks.map((c) => client.from("profiles").select("id, elo, level, gc_level").in("id", c))),
    getLevels(),
  ]);
  const profiles = profileChunks.flatMap((r) => r.data ?? []);
  if (!leagueId) {
    for (const p of profiles) out.set(p.id as string, { elo: p.elo as number, level: p.level as number });
    return out;
  }
  const memberChunks = await Promise.all(
    chunks.map((c) =>
      client.from("league_members").select("user_id, elo, level").eq("league_id", leagueId).in("user_id", c),
    ),
  );
  const members = memberChunks.flatMap((r) => r.data ?? []);
  for (const m of members) out.set(m.user_id as string, { elo: m.elo as number, level: m.level as number });
  for (const p of profiles) {
    if (out.has(p.id as string)) continue;
    const elo = initialEloFromGc((p.gc_level as number | null) ?? 0);
    out.set(p.id as string, { elo, level: levelForElo(elo, levels).level });
  }
  return out;
}

/** Usa nas consultas desta requisição a liga de um mix finalizado (crônica, análise). */
export async function setRequestLeagueOfMatch(matchId: string): Promise<League | null> {
  const leagues = await listLeagues();
  const supabase = await createSupabaseServerClient();
  if (!leagues || !supabase) return null;
  const { data } = await supabase.from("mix_matches").select("league_id").eq("id", matchId).maybeSingle();
  const league = leagues.find((l) => l.id === data?.league_id) ?? null;
  if (league) setRequestLeague(league.slug);
  return league;
}

/**
 * Pode mexer neste mix? Admin da plataforma: em todas as ligas. Admin da liga: só nos
 * mixes da liga atual (a do seletor, onde ele é admin), mesmo que a chamada seja
 * montada à mão com o id de um mix de outra liga. Sem ligas: quem gerencia mixes.
 */
export async function canManageLeagueOf(target: {
  scheduleId?: string | null;
  matchId?: string | null;
  roundId?: string | null;
  registrationId?: string | null;
}): Promise<boolean> {
  const session = await getSession();
  if (!canManageMixes(session)) return false;
  if (isPlatformAdmin(session)) return true;
  const current = await getCurrentLeague();
  if (!current) return true;
  if (current.none) return false;
  const admin = createSupabaseAdminClient();
  if (!admin) return false;
  let scheduleId = target.scheduleId ?? null;
  if (target.roundId) {
    const { data } = await admin
      .from("map_tiebreaker_rounds")
      .select("schedule_id")
      .eq("id", target.roundId)
      .maybeSingle();
    scheduleId = (data?.schedule_id as string | undefined) ?? null;
  }
  if (target.registrationId) {
    const { data } = await admin
      .from("mix_registrations")
      .select("schedule_id")
      .eq("id", target.registrationId)
      .maybeSingle();
    scheduleId = (data?.schedule_id as string | undefined) ?? null;
  }
  if (target.matchId) {
    const { data } = await admin.from("mix_matches").select("league_id").eq("id", target.matchId).maybeSingle();
    return data?.league_id === current.id;
  }
  if (!scheduleId) return false;
  const { data } = await admin.from("mix_schedules").select("community_id").eq("id", scheduleId).maybeSingle();
  return data?.community_id === current.id;
}

export interface LeagueMemberView {
  userId: string;
  name: string;
  avatarUrl: string | null;
  elo: number;
  role: "admin" | "player";
}

/** Membros ativos da liga e quem pode ser adicionado (para a aba Liga do painel). */
export async function leagueMembersView(leagueId: string) {
  const admin = createSupabaseAdminClient();
  if (!admin) return null;
  const [members, profiles] = await Promise.all([
    admin.from("league_members").select("user_id, role, elo, active").eq("league_id", leagueId),
    admin.from("profiles").select("id, display_name").order("display_name"),
  ]);
  if (members.error) return null;
  const active = (members.data ?? []).filter((m) => m.active !== false);
  const ids = new Set(active.map((m) => m.user_id as string));
  const names = new Map((profiles.data ?? []).map((p) => [p.id as string, p.display_name as string]));
  const avatars = await profileAvatars([...ids]);
  const list: LeagueMemberView[] = active
    .map((m) => ({
      userId: m.user_id as string,
      name: names.get(m.user_id as string) ?? "Jogador",
      avatarUrl: avatars.get(m.user_id as string)?.avatarUrl ?? null,
      elo: m.elo as number,
      role: (m.role === "admin" ? "admin" : "player") as LeagueMemberView["role"],
    }))
    .sort((a, b) => Number(b.role === "admin") - Number(a.role === "admin") || a.name.localeCompare(b.name));
  const others = (profiles.data ?? [])
    .filter((p) => !ids.has(p.id as string))
    .map((p) => ({ id: p.id as string, name: p.display_name as string }));
  return { members: list, others };
}

/** Ligas em que um jogador está (membro ativo), lidas pelo servidor (ex.: link pessoal sem login). */
export async function activeLeagueIdsOf(userId: string): Promise<string[] | null> {
  const admin = createSupabaseAdminClient();
  if (!admin || !(await listLeagues())) return null;
  const { data, error } = await admin
    .from("league_members")
    .select("league_id")
    .eq("user_id", userId)
    .eq("active", true);
  if (error) {
    const { data: all } = await admin.from("league_members").select("league_id").eq("user_id", userId);
    return (all ?? []).map((r) => r.league_id as string);
  }
  return (data ?? []).map((r) => r.league_id as string);
}

/**
 * O jogador pode se inscrever neste mix? Só quem é membro da liga do mix (admin da
 * plataforma: qualquer liga). Sem ligas: sim. Devolve o nome da liga para a mensagem.
 */
export async function canJoinScheduleLeague(
  userId: string,
  scheduleId: string,
): Promise<{ ok: true } | { ok: false; league: string }> {
  const leagues = await listLeagues();
  const admin = createSupabaseAdminClient();
  if (!leagues || !admin) return { ok: true };
  const session = await getSession();
  if (session?.id === userId && isPlatformAdmin(session)) return { ok: true };
  const { data } = await admin.from("mix_schedules").select("community_id").eq("id", scheduleId).maybeSingle();
  const league = leagues.find((l) => l.id === data?.community_id);
  if (!league) return { ok: true };
  const mine = (await activeLeagueIdsOf(userId)) ?? [];
  return mine.includes(league.id) ? { ok: true } : { ok: false, league: league.name };
}

export interface CommunityLeague {
  id: string;
  slug: string;
  name: string;
  weekday: number | null;
  members: number;
  admins: number;
  mixes: number;
  schedules: number;
}

export interface CommunityPlayer {
  id: string;
  name: string;
  avatarUrl: string | null;
  /** Por liga: papel de quem é membro ativo. */
  leagues: Record<string, "admin" | "player">;
}

/** Tela Comunidade (super admin): todas as ligas e todos os jogadores cadastrados. */
export async function communityOverview(): Promise<{ leagues: CommunityLeague[]; players: CommunityPlayer[] } | null> {
  const admin = createSupabaseAdminClient();
  const leagues = await listLeagues();
  if (!admin || !leagues) return null;
  const [members, profiles, matches, schedules] = await Promise.all([
    admin.from("league_members").select("league_id, user_id, role, active").limit(20000),
    admin.from("profiles").select("id, display_name").order("display_name"),
    admin.from("mix_matches").select("league_id").limit(20000),
    admin.from("mix_schedules").select("community_id, active"),
  ]);
  if (members.error) return null;
  const active = (members.data ?? []).filter((m) => m.active !== false);
  const avatars = await profileAvatars((profiles.data ?? []).map((p) => p.id as string));
  const count = <T>(rows: T[] | null | undefined, test: (r: T) => boolean) => (rows ?? []).filter(test).length;
  return {
    leagues: leagues.map((l) => ({
      ...l,
      members: count(active, (m) => m.league_id === l.id),
      admins: count(active, (m) => m.league_id === l.id && m.role === "admin"),
      mixes: count(matches.data, (m) => m.league_id === l.id),
      schedules: count(schedules.data, (s) => s.community_id === l.id && s.active !== false),
    })),
    players: (profiles.data ?? []).map((p) => ({
      id: p.id as string,
      name: p.display_name as string,
      avatarUrl: avatars.get(p.id as string)?.avatarUrl ?? null,
      leagues: Object.fromEntries(
        active
          .filter((m) => m.user_id === p.id)
          .map((m) => [m.league_id as string, m.role === "admin" ? "admin" : "player"]),
      ) as Record<string, "admin" | "player">,
    })),
  };
}
