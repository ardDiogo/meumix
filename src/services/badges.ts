import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface Badge {
  id: string;
  name: string;
  description: string | null;
  /** Como conquistar (concedida pelo admin). */
  unlock: string | null;
  icon: string;
  color: string;
  holders: number;
}

export interface PlayerBadge {
  id: string;
  badgeId: string;
  userId: string;
  name: string;
  description: string | null;
  unlock: string | null;
  icon: string;
  color: string;
  note: string | null;
  createdAt: string;
}

/** Todas as insígnias com o número de jogadores que têm cada uma. Sem a migração 0015: vazio. */
export async function listBadges(): Promise<Badge[] | null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const [{ data, error }, { data: links }] = await Promise.all([
    supabase.from("badges").select("*").order("created_at"),
    supabase.from("player_badges").select("badge_id"),
  ]);
  if (error) return null;
  const count = new Map<string, number>();
  for (const l of links ?? []) count.set(l.badge_id as string, (count.get(l.badge_id as string) ?? 0) + 1);
  return (data ?? []).map((b) => ({
    id: b.id as string,
    name: b.name as string,
    description: (b.description as string | null) ?? null,
    unlock: (b.unlock_rule as string | null | undefined) ?? null,
    icon: b.icon as string,
    color: b.color as string,
    holders: count.get(b.id as string) ?? 0,
  }));
}

/** Insígnias concedidas (de todos ou dos jogadores informados), da mais recente para a mais antiga. */
export async function playerBadges(userIds?: string[]): Promise<PlayerBadge[]> {
  const supabase = await createSupabaseServerClient();
  if (!supabase || (userIds && !userIds.length)) return [];
  let query = supabase
    .from("player_badges")
    .select("id, user_id, badge_id, note, created_at, badges(*)")
    .order("created_at", { ascending: false });
  if (userIds) query = query.in("user_id", userIds);
  const { data, error } = await query;
  if (error) return [];
  return (data ?? []).map((r) => {
    const b = (Array.isArray(r.badges) ? r.badges[0] : r.badges) as {
      name: string;
      description: string | null;
      unlock_rule?: string | null;
      icon: string;
      color: string;
    } | null;
    return {
      id: r.id as string,
      badgeId: r.badge_id as string,
      userId: r.user_id as string,
      name: b?.name ?? "Insígnia",
      description: b?.description ?? null,
      unlock: b?.unlock_rule ?? null,
      icon: b?.icon ?? "trophy",
      color: b?.color ?? "#FF6A00",
      note: (r.note as string | null) ?? null,
      createdAt: r.created_at as string,
    };
  });
}
