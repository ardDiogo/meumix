import "server-only";
import {
  computeBadges,
  type BadgeRule,
  type EngineBadge,
  type EngineBet,
  type EngineGc,
  type EngineMatch,
  type TopKey,
} from "@/lib/badge-engine";
import { betKindOf, outcomeOf, scorePrediction } from "@/lib/bolao";
import type { GcMapStored } from "@/lib/gc-api";
import { roundStory, winnerFirst } from "@/lib/gc-analysis";
import { matchHighlights, type StatRow } from "@/lib/match-highlights";
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

  const [matches, records, profiles, maps, allRows, predictions, drafts, gcRows] = await Promise.all([
    admin.from("mix_matches").select("*"),
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
    // Todas as linhas (com convidados), para os destaques serem os mesmos da página do mix.
    allPages((from, to) =>
      admin
        .from("player_match_records")
        .select(
          "id, match_id, user_id, player_name, team, kills, deaths, assists, adr, first_kills, is_mvp, is_lanterna",
        )
        .order("match_id")
        .order("created_at")
        .order("id")
        .range(from, to),
    ),
    // Bolão (sem a migração 0031, só fica sem as insígnias do bolão).
    admin.from("mix_predictions").select("*").limit(20000),
    admin.from("mix_draft_state").select("schedule_id, event_date, captain_a, captain_b"),
    // Dados importados da GC (sem a migração 0035, só fica sem as insígnias da GC).
    admin.from("match_gc_maps").select("match_id, map_order, map_id, data").order("map_order"),
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
  // Destaques de cada partida → id do jogador (ou null se for convidado).
  const rowsByMatch = new Map<string, StatRow[]>();
  for (const r of allRows.data ?? []) {
    const list = rowsByMatch.get(r.match_id as string) ?? [];
    list.push({
      key: r.id as string,
      userId: (r.user_id as string | null) ?? null,
      name: r.player_name as string,
      team: r.team as "A" | "B",
      elo: null,
      avatarUrl: null,
      k: r.kills as number,
      a: r.assists as number,
      d: r.deaths as number,
      adr: r.adr == null ? null : Number(r.adr),
      kast: null,
      s: null,
      fa: 0,
      mk: 0,
      fk: (r.first_kills as number) ?? 0,
      rp: 0,
      drop: 0,
      isMvp: !!r.is_mvp,
      isLanterna: !!r.is_lanterna,
    });
    rowsByMatch.set(r.match_id as string, list);
  }
  const topsOf = (matchId: string) => {
    const tops: Partial<Record<TopKey, string | null>> = {};
    for (const h of matchHighlights(rowsByMatch.get(matchId) ?? [])) {
      if (h.key === "mvp" || h.key === "worst") continue;
      tops[h.key] = h.row.userId;
    }
    // Menos first kills (Baiter): o primeiro com o menor número, como os outros destaques.
    const rows = rowsByMatch.get(matchId) ?? [];
    const low = rows.reduce<StatRow | null>((best, r) => (best == null || r.fk < best.fk ? r : best), null);
    if (low) tops.lowfk = low.userId;
    return tops;
  };

  // Palpites conferidos de cada mix (mesma conta da página do bolão).
  const predsOf = new Map<string, NonNullable<typeof predictions.data>>();
  for (const p of predictions.error ? [] : (predictions.data ?? [])) {
    const k = `${p.schedule_id}|${p.event_date}`;
    predsOf.set(k, [...(predsOf.get(k) ?? []), p]);
  }
  const draftOf = new Map((drafts.data ?? []).map((d) => [`${d.schedule_id}|${d.event_date}`, d]));
  const betsOf = (m: Record<string, unknown>): EngineBet[] => {
    const k = `${m.schedule_id}|${m.event_date}`;
    const preds = predsOf.get(k);
    if (!preds?.length) return [];
    const rows = rowsByMatch.get(m.id as string) ?? [];
    const team = new Map(rows.filter((r) => r.userId).map((r) => [r.userId!, r.team]));
    const draft = draftOf.get(k);
    const captains = (
      draft ? [draft.captain_a, draft.captain_b] : [...new Set(preds.map((p) => p.winner_captain))]
    ) as string[];
    const outcome = outcomeOf({
      maps: ((m.maps as { score_a: number | null; score_b: number | null }[]) ?? []).map((x) => ({
        scoreA: x.score_a ?? null,
        scoreB: x.score_b ?? null,
      })),
      teamOf: (id) => team.get(id) ?? null,
      captains: [captains[0] ?? "", captains[1] ?? ""],
      mvpId: rows.find((r) => r.isMvp)?.userId ?? null,
      lanternaId: rows.find((r) => r.isLanterna)?.userId ?? null,
    });
    return preds.map((p) => ({
      userId: p.user_id as string,
      // Empate também é resultado (dá para acertar no bolão).
      decided: outcome.kind != null,
      score: scorePrediction(
        {
          userId: p.user_id as string,
          winnerCaptain: (p.winner_captain as string | null) ?? null,
          kind: betKindOf(p),
          mvpId: (p.mvp_id as string | null) ?? null,
          lanternaId: (p.lanterna_id as string | null) ?? null,
        },
        outcome,
      ),
    }));
  };

  // GC: por mix, os jogadores com conta somados nos mapas e os mapas virados.
  const gcMapsOf = new Map<string, GcMapStored[]>();
  for (const r of gcRows.error ? [] : (gcRows.data ?? [])) {
    const map = { ...(r.data as GcMapStored), mapId: r.map_id as string };
    if (!Array.isArray(map.players) || !Array.isArray(map.rounds)) continue;
    gcMapsOf.set(r.match_id as string, [...(gcMapsOf.get(r.match_id as string) ?? []), map]);
  }
  const gcOf = (matchId: string): EngineGc | undefined => {
    const list = gcMapsOf.get(matchId);
    if (!list?.length) return undefined;
    const players = new Map<string, EngineGc["players"][number]>();
    for (const m of list)
      for (const p of m.players) {
        if (!p.userId) continue;
        const a = players.get(p.userId) ?? {
          userId: p.userId,
          kills: 0,
          headshots: 0,
          aces: 0,
          biggestClutch: null,
          entriesWon: 0,
          entriesDuels: 0,
        };
        a.kills += p.k ?? 0;
        a.headshots += p.hs ?? 0;
        a.aces += p.multi?.[4] ?? 0;
        if (p.clutch?.biggest) a.biggestClutch = Math.max(a.biggestClutch ?? 0, p.clutch.biggest);
        a.entriesWon += p.entries?.won ?? 0;
        a.entriesDuels += p.entries?.duels ?? 0;
        players.set(p.userId, a);
      }
    const comebacks = list.flatMap((m) => {
      const story = roundStory(m);
      if (!story.comeback || !story.winner) return [];
      const final = story.scores.at(-1) ?? { a: m.scoreA, b: m.scoreB };
      return [
        {
          mapId: m.mapId,
          deficit: story.comeback.deficit,
          from: winnerFirst(story.comeback.from, story.winner),
          final: winnerFirst(final, story.winner),
          winners: m.players.filter((p) => p.userId && p.team === story.winner).map((p) => p.userId!),
        },
      ];
    });
    return { players: [...players.values()], comebacks };
  };

  const engineMatches = (matches.data ?? []).map((m) => ({
    leagueId: (m.league_id as string | null | undefined) ?? null,
    match: {
      id: m.id as string,
      date: m.event_date as string,
      finalizedAt: (m.finalized_at as string) ?? "",
      maps: ((m.maps as { map_id: string; score_a: number | null; score_b: number | null }[]) ?? []).map((x) => ({
        mapId: x.map_id,
        scoreA: x.score_a ?? null,
        scoreB: x.score_b ?? null,
      })),
      records: byMatch.get(m.id as string) ?? [],
      tops: topsOf(m.id as string),
      bets: betsOf(m),
      participants: [
        ...new Set((rowsByMatch.get(m.id as string) ?? []).map((r) => r.userId).filter((u): u is string => !!u)),
      ],
      gc: gcOf(m.id as string),
    } satisfies EngineMatch,
  }));
  const mapNames = Object.fromEntries((maps.data ?? []).map((m) => [m.id as string, m.name as string]));
  const now = new Date().toISOString();

  // Ligas (migrações 0045–0047): cada liga calcula as insígnias só com os mixes dela.
  // Sem elas, uma rodada só com todos os mixes, do jeito antigo.
  const [leagueRows, members, withLeague] = await Promise.all([
    admin.from("communities").select("id, slug").order("sort_order"),
    admin.from("league_members").select("league_id, user_id, elo"),
    admin.from("player_badges").select("league_id").limit(1),
  ]);
  const leagues =
    !leagueRows.error && !members.error && !withLeague.error && engineMatches.every((m) => m.leagueId)
      ? (leagueRows.data ?? []).map((l) => ({ id: l.id as string, slug: l.slug as string }))
      : null;

  const total = { inseridas: 0, atualizadas: 0, removidas: 0 };
  const runs = leagues
    ? leagues.map((l) => ({
        league: l,
        matches: engineMatches.filter((m) => m.leagueId === l.id).map((m) => m.match),
        currentElo: new Map(
          (members.data ?? []).filter((x) => x.league_id === l.id).map((x) => [x.user_id as string, x.elo as number]),
        ),
      }))
    : [
        {
          league: null,
          matches: engineMatches.map((m) => m.match),
          currentElo: new Map((profiles.data ?? []).map((p) => [p.id as string, p.elo as number])),
        },
      ];

  for (const run of runs) {
    const { rows, progress } = computeBadges({
      matches: run.matches,
      badges,
      currentElo: run.currentElo,
      now,
      mapNames,
    });
    // A mesma conquista pode sair nas duas ligas: fora da principal, a referência leva a liga.
    const ref = (r: string) => (run.league && run.league.slug !== "principal" ? `${run.league.slug}:${r}` : r);
    const payload = {
      p_badges: badges.map((b) => b.id),
      p_rows: rows.map((r) => ({
        user_id: r.userId,
        badge_id: r.badgeId,
        source_ref: ref(r.sourceRef),
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
    };
    const { data, error } = run.league
      ? await admin.rpc("sync_auto_badges_league", { p_league: run.league.id, ...payload })
      : await admin.rpc("sync_auto_badges", payload);
    if (error) {
      console.error("[badges] sync:", error.code, error.message);
      return { ok: false, message: "Não foi possível gravar as insígnias." };
    }
    const d = (data ?? {}) as { inseridas?: number; atualizadas?: number; removidas?: number };
    total.inseridas += d.inseridas ?? 0;
    total.atualizadas += d.atualizadas ?? 0;
    total.removidas += d.removidas ?? 0;
  }
  return { ok: true, ...total, badges: badges.length };
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
