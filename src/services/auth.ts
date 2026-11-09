import "server-only";
import { cache } from "react";
import {
  canManageAdmins,
  canManageMixes,
  isSuperAdminEmail,
  type PlatformRole,
  type SessionUser,
} from "@/lib/auth/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { LEAGUE_COOKIE, pickLeagueSlug } from "@/lib/league";
import { leagueIdsWithMixToday } from "./league-today";
import type { CommunityRole } from "@/types/domain";

/**
 * Sessão do usuário atual (Supabase Auth). Deduplicada por requisição.
 *
 * Sem Supabase configurado, apenas em desenvolvimento local é possível
 * simular uma sessão com `MEUMIX_DEV_SESSION_EMAIL`.
 */
export const getSession = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return devSession();

  const { data, error } = await supabase.auth.getUser();
  const user = data.user;
  if (error || !user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, role")
    .eq("id", user.id)
    .maybeSingle();
  const email = user.email ?? "";

  return {
    id: user.id,
    email,
    displayName:
      profile?.display_name ?? (user.user_metadata?.display_name as string | undefined) ?? email.split("@")[0]!,
    role: profile?.role === "admin" ? "admin" : "user",
    isSuperAdmin: isSuperAdminEmail(email, !!user.email_confirmed_at),
    communityRole: await leagueRole(supabase, user.id),
  };
});

/**
 * Papel na liga atual (a do seletor do topo; sem escolha válida, a primeira liga em
 * que a pessoa joga, como em `getCurrentLeague`). Admin da liga gerencia os mixes dela.
 * Sem as migrações das ligas: nenhum.
 */
async function leagueRole(
  supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>,
  userId: string,
): Promise<CommunityRole | null> {
  const { data, error } = await supabase
    .from("league_members")
    .select("league_id, role, active, communities(slug, sort_order, weekday)")
    .eq("user_id", userId)
    .eq("active", true);
  if (error || !data?.length) return null;
  const rows = data
    .map((r) => {
      const c = (Array.isArray(r.communities) ? r.communities[0] : r.communities) as
        { slug: string; sort_order: number | null; weekday: number | null } | null | undefined;
      return {
        id: r.league_id as string,
        role: r.role as string,
        slug: c?.slug ?? "",
        order: c?.sort_order ?? 0,
        weekday: c?.weekday ?? null,
      };
    })
    .sort((a, b) => a.order - b.order);
  // A mesma escolha de getCurrentLeague (escolhida hoje, liga do dia, última escolhida).
  // A mesma escolha de getCurrentLeague (inclui a liga com mix hoje pela agenda).
  const today = await leagueIdsWithMixToday();
  const slug = pickLeagueSlug(
    (await cookies()).get(LEAGUE_COOKIE)?.value,
    rows,
    new Set(rows.map((r) => r.slug)),
    new Date(),
    new Set(rows.filter((r) => today.has(r.id)).map((r) => r.slug)),
  );
  const row = rows.find((r) => r.slug === slug) ?? rows[0]!;
  return row.role === "admin" ? "admin" : "player";
}

function devSession(): SessionUser | null {
  const email = process.env.MEUMIX_DEV_SESSION_EMAIL;
  if (process.env.NODE_ENV === "production" || !email) return null;
  return {
    id: "dev-user",
    email,
    displayName: email.split("@")[0]!,
    role: "user" satisfies PlatformRole,
    isSuperAdmin: isSuperAdminEmail(email, true),
    communityRole: null,
  };
}

export async function getPermissions() {
  const session = await getSession();
  return { session, canManageMixes: canManageMixes(session), canManageAdmins: canManageAdmins(session) };
}
