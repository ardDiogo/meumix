import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { canManageMixes } from "@/lib/auth/permissions";
import { LEAGUE_COOKIE, leagueLabel, type League } from "@/lib/league";
import { initialEloFromGc, levelForElo } from "@/lib/levels";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSession } from "./auth";
import { getLevels } from "./levels";

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

/** Ligas em que a pessoa logada joga. */
export const myLeagueIds = cache(async (): Promise<Set<string>> => {
  const session = await getSession();
  const supabase = await createSupabaseServerClient();
  if (!session || !supabase) return new Set();
  const { data } = await supabase.from("league_members").select("league_id").eq("user_id", session.id);
  return new Set((data ?? []).map((r) => r.league_id as string));
});

/**
 * Ligas que aparecem no seletor: admin vê todas; quem joga vê as suas; quem ainda
 * não jogou nenhuma (ou não entrou) vê todas.
 */
export const visibleLeagues = cache(async (): Promise<League[]> => {
  const leagues = (await listLeagues()) ?? [];
  const session = await getSession();
  if (!session || canManageMixes(session)) return leagues;
  const mine = await myLeagueIds();
  const own = leagues.filter((l) => mine.has(l.id));
  return own.length ? own : leagues;
});

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
  const wanted = (await cookies()).get(LEAGUE_COOKIE)?.value ?? null;
  const chosen = wanted ? visible.find((l) => l.slug === wanted) : undefined;
  if (chosen) return chosen;
  const mine = await myLeagueIds();
  return visible.find((l) => mine.has(l.id)) ?? visible[0] ?? leagues[0]!;
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
  const { data } = await supabase.from("league_members").select("league_id").eq("user_id", userId);
  const ids = new Set((data ?? []).map((r) => r.league_id as string));
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
