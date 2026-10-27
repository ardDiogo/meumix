import "server-only";
import {
  bolaoRanking,
  outcomeOf,
  scorePrediction,
  type BolaoRankingRow,
  type MixOutcome,
  type Prediction,
  type PredictionScore,
} from "@/lib/bolao";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { profileAvatars } from "./avatars";

/**
 * Bolão do mix. Os palpites só são lidos pelo servidor (RLS sem acesso público):
 * enquanto o bolão está aberto, cada um vê só o próprio palpite e a divisão dos
 * votos; depois de fechar, todos os palpites aparecem.
 */

type Admin = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

interface PredictionRow {
  schedule_id: string;
  event_date: string;
  user_id: string;
  winner_captain: string;
  maps_won: number;
  maps_lost: number;
  mvp_id: string | null;
  lanterna_id: string | null;
  updated_at: string;
}

const COLUMNS =
  "schedule_id, event_date, user_id, winner_captain, maps_won, maps_lost, mvp_id, lanterna_id, updated_at";

const toPrediction = (r: PredictionRow): Prediction => ({
  userId: r.user_id,
  winnerCaptain: r.winner_captain,
  mapsWon: r.maps_won,
  mapsLost: r.maps_lost,
  mvpId: r.mvp_id,
  lanternaId: r.lanterna_id,
});

export interface BolaoEntry {
  userId: string;
  name: string;
  avatarUrl: string | null;
  prediction: Prediction;
  /** Pontos (só com o mix finalizado). */
  score: PredictionScore | null;
}

export interface BolaoView {
  status: "open" | "closed" | "final";
  closesAt: string;
  /** Capitães (time A, time B), pelos quais os times são identificados. */
  captains: [string, string];
  teams: [string[], string[]];
  /** Mapas do mix (para os placares possíveis). */
  mapsCount: number;
  total: number;
  /** Palpites no time de cada capitão. */
  split: [number, number];
  mine: Prediction | null;
  /** Todos os palpites (só depois de fechar). */
  entries: BolaoEntry[] | null;
  /** Quem já palpitou (só nome e foto, sem o palpite), na ordem dos palpites. */
  voters: { userId: string; name: string; avatarUrl: string | null }[];
  outcome: MixOutcome | null;
}

async function names(admin: Admin, ids: string[]) {
  if (!ids.length) return new Map<string, string>();
  const { data } = await admin.from("profiles").select("id, display_name").in("id", ids);
  return new Map((data ?? []).map((p) => [p.id as string, p.display_name as string]));
}

/** Resultado oficial de um mix finalizado, para conferir os palpites. */
async function matchOutcome(admin: Admin, matchId: string, captains: string[]): Promise<MixOutcome | null> {
  const [{ data: match }, { data: records }] = await Promise.all([
    admin.from("mix_matches").select("maps").eq("id", matchId).maybeSingle(),
    admin.from("player_match_records").select("user_id, team, is_mvp, is_lanterna").eq("match_id", matchId),
  ]);
  if (!match) return null;
  const rows = records ?? [];
  const team = new Map(rows.filter((r) => r.user_id).map((r) => [r.user_id as string, r.team as "A" | "B"]));
  const maps = ((match.maps as { score_a: number | null; score_b: number | null }[]) ?? []).map((m) => ({
    scoreA: m.score_a ?? null,
    scoreB: m.score_b ?? null,
  }));
  return outcomeOf({
    maps,
    teamOf: (id) => team.get(id) ?? null,
    captains: [captains[0] ?? "", captains[1] ?? ""],
    mvpId: (rows.find((r) => r.is_mvp)?.user_id as string | null) ?? null,
    lanternaId: (rows.find((r) => r.is_lanterna)?.user_id as string | null) ?? null,
  });
}

/** Capitães do mix: os do PICK; sem ele (seleção reiniciada), os que aparecem nos palpites. */
function captainsOf(draft: { captain_a: string; captain_b: string } | null, rows: PredictionRow[]) {
  if (draft) return [draft.captain_a, draft.captain_b];
  return [...new Set(rows.map((r) => r.winner_captain))].slice(0, 2);
}

/** Bolão do próximo mix (painel do dashboard). Só existe com os times definidos. */
export async function loadBolao(opts: {
  scheduleId: string;
  date: string;
  closesAt: Date;
  captains: [string, string];
  teams: [string[], string[]];
  mapsCount: number;
  finalizedMatchId: string | null;
  viewerId: string | null;
  now?: Date;
}): Promise<BolaoView | null> {
  const admin = createSupabaseAdminClient();
  if (!admin) return null;
  const { data, error } = await admin
    .from("mix_predictions")
    .select(COLUMNS)
    .match({ schedule_id: opts.scheduleId, event_date: opts.date })
    .order("created_at");
  if (error) return null; // sem a migração 0031: sem bolão
  const rows = (data ?? []) as PredictionRow[];
  const now = opts.now ?? new Date();
  const status = opts.finalizedMatchId ? "final" : now < opts.closesAt ? "open" : "closed";
  const mine = rows.find((r) => r.user_id === opts.viewerId);

  let entries: BolaoEntry[] | null = null;
  let outcome: MixOutcome | null = null;
  const ids = rows.map((r) => r.user_id);
  const [nameMap, avatars] = ids.length
    ? await Promise.all([names(admin, ids), profileAvatars(ids)])
    : [new Map<string, string>(), new Map<string, { avatarUrl: string | null }>()];
  const voters = rows.map((r) => ({
    userId: r.user_id,
    name: nameMap.get(r.user_id) ?? "Jogador",
    avatarUrl: avatars.get(r.user_id)?.avatarUrl ?? null,
  }));
  if (status !== "open") {
    outcome = opts.finalizedMatchId ? await matchOutcome(admin, opts.finalizedMatchId, opts.captains) : null;
    entries = rows
      .map((r) => ({
        userId: r.user_id,
        name: nameMap.get(r.user_id) ?? "Jogador",
        avatarUrl: avatars.get(r.user_id)?.avatarUrl ?? null,
        prediction: toPrediction(r),
        score: outcome ? scorePrediction(toPrediction(r), outcome) : null,
      }))
      .sort((a, b) => (b.score?.points ?? 0) - (a.score?.points ?? 0) || a.name.localeCompare(b.name));
  }

  return {
    status,
    closesAt: opts.closesAt.toISOString(),
    captains: opts.captains,
    teams: opts.teams,
    mapsCount: opts.mapsCount,
    total: rows.length,
    split: [
      rows.filter((r) => r.winner_captain === opts.captains[0]).length,
      rows.filter((r) => r.winner_captain === opts.captains[1]).length,
    ],
    mine: mine ? toPrediction(mine) : null,
    entries,
    voters,
    outcome,
  };
}

/** Palpites conferidos de um mix finalizado (página do mix). */
export async function bolaoForMatch(matchId: string, { withProfiles = true } = {}) {
  const admin = createSupabaseAdminClient();
  if (!admin) return null;
  const { data: match } = await admin
    .from("mix_matches")
    .select("schedule_id, event_date")
    .eq("id", matchId)
    .maybeSingle();
  if (!match?.schedule_id) return null;
  const key = { schedule_id: match.schedule_id as string, event_date: match.event_date as string };
  const [{ data, error }, { data: draft }] = await Promise.all([
    admin.from("mix_predictions").select(COLUMNS).match(key),
    admin.from("mix_draft_state").select("captain_a, captain_b").match(key).maybeSingle(),
  ]);
  if (error || !data?.length) return null;
  const rows = data as PredictionRow[];
  const captains = captainsOf(draft as { captain_a: string; captain_b: string } | null, rows);
  const outcome = await matchOutcome(admin, matchId, captains);
  if (!outcome) return null;
  const ids = [
    ...new Set(
      rows.flatMap((r) => [r.user_id, r.winner_captain, r.mvp_id, r.lanterna_id]).filter((id): id is string => !!id),
    ),
  ];
  // Fora de uma página (avisos), não precisa de nomes e fotos.
  const [nameMap, avatars] = withProfiles
    ? await Promise.all([names(admin, ids), profileAvatars(ids)])
    : [new Map<string, string>(), new Map<string, { avatarUrl: string | null }>()];
  const entries: BolaoEntry[] = rows
    .map((r) => ({
      userId: r.user_id,
      name: nameMap.get(r.user_id) ?? "Jogador",
      avatarUrl: avatars.get(r.user_id)?.avatarUrl ?? null,
      prediction: toPrediction(r),
      score: scorePrediction(toPrediction(r), outcome),
    }))
    .sort((a, b) => b.score!.points - a.score!.points || a.name.localeCompare(b.name));
  return { entries, outcome, names: Object.fromEntries(nameMap) as Record<string, string> };
}

export interface BolaoRankingView {
  rows: (BolaoRankingRow & { name: string; avatarUrl: string | null })[];
  mixes: number;
}

/** Ranking geral dos palpiteiros (só mixes finalizados contam). */
export async function getBolaoRanking(): Promise<BolaoRankingView | null> {
  const admin = createSupabaseAdminClient();
  if (!admin) return null;
  const { data, error } = await admin.from("mix_predictions").select(COLUMNS).limit(10000);
  if (error) return null;
  const rows = (data ?? []) as PredictionRow[];
  if (!rows.length) return { rows: [], mixes: 0 };

  const [{ data: matches }, { data: drafts }] = await Promise.all([
    admin.from("mix_matches").select("id, schedule_id, event_date"),
    admin.from("mix_draft_state").select("schedule_id, event_date, captain_a, captain_b"),
  ]);
  const byOccurrence = new Map<string, PredictionRow[]>();
  for (const r of rows) {
    const k = `${r.schedule_id}|${r.event_date}`;
    byOccurrence.set(k, [...(byOccurrence.get(k) ?? []), r]);
  }
  const draftOf = new Map(
    (drafts ?? []).map((d) => [`${d.schedule_id}|${d.event_date}`, d as { captain_a: string; captain_b: string }]),
  );

  const scored: { userId: string; score: PredictionScore }[] = [];
  let mixes = 0;
  for (const m of matches ?? []) {
    const k = `${m.schedule_id}|${m.event_date}`;
    const preds = byOccurrence.get(k);
    if (!preds) continue;
    const outcome = await matchOutcome(admin, m.id as string, captainsOf(draftOf.get(k) ?? null, preds));
    if (!outcome) continue;
    mixes++;
    for (const p of preds) scored.push({ userId: p.user_id, score: scorePrediction(toPrediction(p), outcome) });
  }
  const ranking = bolaoRanking(scored);
  const ids = ranking.map((r) => r.userId);
  const [nameMap, avatars] = await Promise.all([names(admin, ids), profileAvatars(ids)]);
  return {
    mixes,
    rows: ranking.map((r) => ({
      ...r,
      name: nameMap.get(r.userId) ?? "Jogador",
      avatarUrl: avatars.get(r.userId)?.avatarUrl ?? null,
    })),
  };
}

/** Pontos de cada palpiteiro num mix recém-finalizado (para o aviso no celular). */
export async function bolaoPointsForMatch(matchId: string) {
  const result = await bolaoForMatch(matchId, { withProfiles: false });
  return result?.entries.map((e) => ({ userId: e.userId, points: e.score?.points ?? 0 })) ?? [];
}

/** Quantos mapas o mix costuma ter (o último finalizado; padrão 3). */
export async function typicalMapsCount() {
  const admin = createSupabaseAdminClient();
  const { data } = admin
    ? await admin.from("mix_matches").select("maps").order("finalized_at", { ascending: false }).limit(1)
    : { data: null };
  const n = (data?.[0]?.maps as unknown[] | undefined)?.length ?? 0;
  return n >= 1 && n <= 5 ? n : 3;
}
