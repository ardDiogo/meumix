import "server-only";
import { BADGE_RULES, MANUAL_BADGE_PRIORITY, type BadgeRule } from "@/lib/badge-engine";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type BadgeKind = "permanent" | "dynamic";

export interface Badge {
  id: string;
  name: string;
  description: string | null;
  /** Como conquistar. */
  unlock: string | null;
  /** Quando deixa de valer (dinâmicas). */
  deactivation: string | null;
  icon: string;
  color: string;
  kind: BadgeKind;
  /** Regra automática; `null` = concedida pelo admin. */
  autoRule: BadgeRule | null;
  params: Record<string, number>;
  enabled: boolean;
  /** Jogadores com a insígnia ativa agora. */
  holders: number;
  /** Conquistas registradas (ativas + históricas). */
  conquests: number;
}

export interface PlayerBadge {
  id: string;
  badgeId: string;
  userId: string;
  name: string;
  description: string | null;
  unlock: string | null;
  deactivation: string | null;
  icon: string;
  color: string;
  note: string | null;
  createdAt: string;
  kind: BadgeKind;
  auto: boolean;
  /** Motivo da conquista (automáticas). */
  reason: string | null;
  /** Fim da conquista; `null` = ativa. */
  deactivatedAt: string | null;
  endReason: string | null;
  /** Mapa, no Rei do Mapa. */
  scope: string;
  /** Ordem de destaque (PICK e listas curtas). */
  priority: number;
  /** Desativada à mão pelo admin (o recálculo não reativa). */
  locked: boolean;
}

export interface BadgeProgressView {
  userId: string;
  badgeId: string;
  current: number;
  target: number;
}

type BadgeRow = Record<string, unknown>;

const kindOf = (b: BadgeRow): BadgeKind => (b.kind === "dynamic" ? "dynamic" : "permanent");
const ruleOf = (b: BadgeRow): BadgeRule | null =>
  typeof b.auto_rule === "string" && b.auto_rule in BADGE_RULES ? (b.auto_rule as BadgeRule) : null;
const enabledOf = (b: BadgeRow) => b.enabled !== false;

function paramsOf(b: BadgeRow) {
  const rule = ruleOf(b);
  const raw = (b.params ?? {}) as Record<string, unknown>;
  const out: Record<string, number> = { ...(rule ? BADGE_RULES[rule].defaults : {}) };
  for (const [k, v] of Object.entries(raw)) if (typeof v === "number") out[k] = v;
  return out;
}

/** Todas as insígnias, com quantos jogadores têm agora e quantas conquistas já houve. */
export async function listBadges(): Promise<Badge[] | null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const [{ data, error }, { data: links }] = await Promise.all([
    supabase.from("badges").select("*").order("created_at"),
    supabase.from("player_badges").select("*"),
  ]);
  if (error) return null;
  const active = new Map<string, number>();
  const total = new Map<string, number>();
  for (const l of links ?? []) {
    const id = l.badge_id as string;
    total.set(id, (total.get(id) ?? 0) + 1);
    if (!l.deactivated_at) active.set(id, (active.get(id) ?? 0) + 1);
  }
  return (data ?? []).map((b) => ({
    id: b.id as string,
    name: b.name as string,
    description: (b.description as string | null) ?? null,
    unlock: (b.unlock_rule as string | null | undefined) ?? null,
    deactivation: (b.deactivation_rule as string | null | undefined) ?? null,
    icon: b.icon as string,
    color: b.color as string,
    kind: kindOf(b),
    autoRule: ruleOf(b),
    params: paramsOf(b),
    enabled: enabledOf(b),
    holders: active.get(b.id as string) ?? 0,
    conquests: total.get(b.id as string) ?? 0,
  }));
}

/**
 * Conquistas (de todos ou dos jogadores informados), da mais recente para a mais
 * antiga. Por padrão só as ativas de insígnias habilitadas; `history` inclui as encerradas.
 */
export async function playerBadges(userIds?: string[], opts: { history?: boolean } = {}): Promise<PlayerBadge[]> {
  const supabase = await createSupabaseServerClient();
  if (!supabase || (userIds && !userIds.length)) return [];
  let query = supabase.from("player_badges").select("*, badges(*)").order("created_at", { ascending: false });
  if (userIds) query = query.in("user_id", userIds);
  const { data, error } = await query;
  if (error) return [];
  return (data ?? [])
    .map((r) => {
      const b = ((Array.isArray(r.badges) ? r.badges[0] : r.badges) ?? {}) as BadgeRow;
      const rule = ruleOf(b);
      return {
        id: r.id as string,
        badgeId: r.badge_id as string,
        userId: r.user_id as string,
        name: (b.name as string) ?? "Insígnia",
        description: (b.description as string | null) ?? null,
        unlock: (b.unlock_rule as string | null | undefined) ?? null,
        deactivation: (b.deactivation_rule as string | null | undefined) ?? null,
        icon: (b.icon as string) ?? "trophy",
        color: (b.color as string) ?? "#FF6A00",
        note: (r.note as string | null) ?? null,
        createdAt: r.created_at as string,
        kind: kindOf(b),
        auto: r.source === "auto",
        reason: (r.reason as string | null | undefined) ?? null,
        deactivatedAt: (r.deactivated_at as string | null | undefined) ?? null,
        endReason: (r.end_reason as string | null | undefined) ?? null,
        scope: (r.scope as string | undefined) ?? "",
        priority: rule ? BADGE_RULES[rule].priority : MANUAL_BADGE_PRIORITY,
        locked: r.locked === true,
        enabled: enabledOf(b),
      };
    })
    .filter((x) => x.enabled && (opts.history || !x.deactivatedAt))
    .map((x) => {
      const { enabled, ...rest } = x;
      void enabled;
      return rest;
    });
}

/** Progresso atual das insígnias automáticas (ex.: 2/3 vitórias seguidas). */
export async function badgeProgress(userIds: string[]): Promise<BadgeProgressView[]> {
  const supabase = await createSupabaseServerClient();
  if (!supabase || !userIds.length) return [];
  const { data, error } = await supabase.from("badge_progress").select("*").in("user_id", userIds);
  if (error) return [];
  return (data ?? []).map((p) => ({
    userId: p.user_id as string,
    badgeId: p.badge_id as string,
    current: p.current as number,
    target: p.target as number,
  }));
}

/** Insígnias ativas mais relevantes primeiro (PICK e listas curtas). */
export function byPriority<T extends Pick<PlayerBadge, "priority" | "createdAt">>(list: T[]) {
  return [...list].sort((a, b) => b.priority - a.priority || b.createdAt.localeCompare(a.createdAt));
}
