import "server-only";
import { computeBadges, type BadgeRule, type EngineBadge, type EngineMatch } from "@/lib/badge-engine";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type Page = PromiseLike<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>;

async function allPages(query: (from: number, to: number) => Page) {
  const size = 1000;
  const data: Record<string, unknown>[] = [];
  for (let from = 0; ; from += size) {
    const page = await query(from, from + size - 1);
    if (page.error) return { data: null, error: page.error };
    data.push(...(page.data ?? []));
    if ((page.data?.length ?? 0) < size) return { data, error: null };
  }
}

export type BadgeSyncResult =
  | { ok: true; inseridas: number; atualizadas: number; removidas: number; badges: number }
  | { ok: false; message: string };

/**
 * Recalcula as insígnias automáticas a partir dos resultados oficiais e grava
 * o resultado numa transação (sync_auto_badges). Idempotente: pode ser chamado
 * quantas vezes for preciso. Chamado depois de finalizar, excluir ou corrigir
 * um mix, vincular convidados, ajustar ELO e pelo cron diário.
 */
export async function recomputeBadges(): Promise<BadgeSyncResult> {
  const admin = createSupabaseAdminClient();
  if (!admin) return { ok: false, message: "Banco não configurado." };

  const { data: badgeRows, error: badgeError } = await admin
    .from("badges")
    .select("id, auto_rule, params, enabled")
    .not("auto_rule", "is", null);
  if (badgeError) {
    return {
      ok: false,
      message: badgeError.code === "42703" ? "Rode a migração 0025_badges_auto.sql no Supabase." : badgeError.message,
    };
  }
  const badges: EngineBadge[] = (badgeRows ?? [])
    .filter((b) => b.enabled)
    .map((b) => ({
      id: b.id as string,
      rule: b.auto_rule as BadgeRule,
      params: (b.params ?? {}) as Record<string, unknown>,
    }));
  if (!badges.length) return { ok: true, inseridas: 0, atualizadas: 0, removidas: 0, badges: 0 };

  const [matches, records, profiles, maps] = await Promise.all([
    admin.from("mix_matches").select("id, event_date, finalized_at, maps"),
    // O Supabase devolve no máximo 1000 linhas por consulta: lê em páginas.
    allPages((from, to) =>
      admin
        .from("player_match_records")
        .select("match_id, user_id, team, kills, deaths, assists, adr, kast, is_mvp, is_lanterna, elo_after")
        .not("user_id", "is", null)
        .eq("calculate_elo", true)
        .order("match_id")
        .order("user_id")
        .range(from, to),
    ),
    admin.from("profiles").select("id, elo"),
    admin.from("maps").select("id, name"),
  ]);
  if (matches.error || records.error || profiles.error) {
    return { ok: false, message: "Não foi possível ler os resultados." };
  }

  const byMatch = new Map<string, EngineMatch["records"]>();
  for (const r of records.data ?? []) {
    const list = byMatch.get(r.match_id as string) ?? [];
    list.push({
      userId: r.user_id as string,
      team: r.team as "A" | "B",
      kills: r.kills as number,
      deaths: r.deaths as number,
      assists: r.assists as number,
      adr: r.adr == null ? null : Number(r.adr),
      kast: r.kast == null ? null : Number(r.kast),
      isMvp: !!r.is_mvp,
      isLanterna: !!r.is_lanterna,
      eloAfter: (r.elo_after as number | null) ?? null,
    });
    byMatch.set(r.match_id as string, list);
  }
  const engineMatches: EngineMatch[] = (matches.data ?? []).map((m) => ({
    id: m.id as string,
    date: m.event_date as string,
    finalizedAt: (m.finalized_at as string) ?? "",
    maps: ((m.maps as { map_id: string; score_a: number | null; score_b: number | null }[]) ?? []).map((x) => ({
      mapId: x.map_id,
      scoreA: x.score_a ?? null,
      scoreB: x.score_b ?? null,
    })),
    records: byMatch.get(m.id as string) ?? [],
  }));

  const { rows, progress } = computeBadges({
    matches: engineMatches,
    badges,
    currentElo: new Map((profiles.data ?? []).map((p) => [p.id as string, p.elo as number])),
    now: new Date().toISOString(),
    mapNames: Object.fromEntries((maps.data ?? []).map((m) => [m.id as string, m.name as string])),
  });

  const { data, error } = await admin.rpc("sync_auto_badges", {
    p_badges: badges.map((b) => b.id),
    p_rows: rows.map((r) => ({
      user_id: r.userId,
      badge_id: r.badgeId,
      source_ref: r.sourceRef,
      scope: r.scope,
      activated_at: r.activatedAt,
      deactivated_at: r.deactivatedAt,
      reason: r.reason.slice(0, 200),
      end_reason: r.endReason?.slice(0, 200) ?? null,
    })),
    p_progress: progress.map((p) => ({
      user_id: p.userId,
      badge_id: p.badgeId,
      current: p.current,
      target: p.target,
      detail: p.detail.slice(0, 120),
    })),
  });
  if (error) {
    console.error("[badges] sync:", error.code, error.message);
    return { ok: false, message: "Não foi possível gravar as insígnias." };
  }
  const d = (data ?? {}) as { inseridas?: number; atualizadas?: number; removidas?: number };
  return {
    ok: true,
    inseridas: d.inseridas ?? 0,
    atualizadas: d.atualizadas ?? 0,
    removidas: d.removidas ?? 0,
    badges: badges.length,
  };
}

/** Versão para depois de uma ação: nunca derruba a ação principal. */
export async function recomputeBadgesSafely() {
  try {
    const r = await recomputeBadges();
    if (!r.ok) console.error("[badges]", r.message);
    return r;
  } catch (e) {
    console.error("[badges] falha ao recalcular", e);
    return { ok: false as const, message: "Falha ao recalcular as insígnias." };
  }
}
