import "server-only";
import { currentOccurrence, describeRecurrence, type Occurrence } from "@/lib/mix-schedule";
import { isAuthConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { tally } from "@/lib/mix-rules";
import { getFeatures } from "./features";
import { activePenalties } from "./penalties";
import { finalMaps, type RoundRow } from "./tiebreaker";
import type { MixRecurrence, Weekday } from "@/types/domain";
import { profileAvatars } from "./avatars";
import { listAllMaps } from "./maps";
import { loadSuggestion, syncSuggestion, teamWinProbability, type SuggestionView } from "./team-suggestion";

export const DEFAULT_COMMUNITY_SLUG = "principal";

export interface ScheduleRow {
  id: string;
  recurrence_kind: "weekly" | "once";
  weekday: number | null;
  event_date: string | null;
  event_time: string;
  registration_opens_at: string;
  max_players: number;
  active: boolean;
  created_by: string | null;
  created_at: string;
}

export interface Schedule {
  id: string;
  recurrence: MixRecurrence;
  eventTime: string;
  registrationOpensAt: string;
  maxPlayers: number;
  active: boolean;
  createdBy: string | null;
  createdAt: string;
}

export function toSchedule(row: ScheduleRow): Schedule {
  return {
    id: row.id,
    recurrence:
      row.recurrence_kind === "weekly"
        ? { kind: "weekly", weekday: row.weekday as Weekday }
        : { kind: "once", date: row.event_date! },
    eventTime: row.event_time.slice(0, 5),
    registrationOpensAt: row.registration_opens_at.slice(0, 5),
    maxPlayers: row.max_players,
    active: row.active,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export interface Registration {
  id: string;
  userId: string;
  displayName: string;
  /** Foto do perfil Steam, se vinculado. */
  avatarUrl: string | null;
  createdAt: string;
  position: number;
  status: "classified" | "reserve";
  device: "mobile" | "desktop" | null;
  /** Já votou nos mapas. */
  mapVoted: boolean;
  /** Votos de capitão dados por este jogador. */
  captainVotesGiven: number;
  /** Votos de capitão recebidos (só contam votos de classificados). */
  captainVotesReceived: number;
  /** Punição ativa (mostrada com ícone na lista). */
  penalty: { reason: string; delaySeconds: number } | null;
}

/** Saída da lista (cancelou ou foi removido por um admin). */
export interface Departure {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  registeredAt: string | null;
  leftAt: string;
  /** Quem tirou o jogador; null quando ele mesmo saiu. */
  removedBy: string | null;
}

export interface TiebreakerRoundView {
  id: string;
  roundNumber: 1 | 2;
  status: "voting" | "completed" | "resolved_random";
  candidates: { id: string; name: string; votes: number }[];
  slots: number;
  votesCast: number;
  myVote: string[];
  winning: string[];
  random: string[];
}

export interface TiebreakerView {
  enabled: boolean;
  rounds: TiebreakerRoundView[];
  /** Mapas definidos para o mix (após a escolha dos times). */
  finalMaps: { id: string; name: string; random: boolean }[];
  pending: boolean;
}

export interface VoteSummary {
  maps: { id: string; name: string }[];
  /** Apuração dos mapas (só votos de classificados), do mais votado ao menos. */
  mapTally: { id: string; name: string; votes: number }[];
  captainTally: { userId: string; displayName: string; votes: number }[];
  /** Votos de capitão dados pelos classificados (meta: classificados × 2). */
  captainVotesCast: number;
  mine: { maps: string[]; captains: string[] };
}

export type PptChoice = "rock" | "paper" | "scissors";

export interface DraftView {
  status: "ppt" | "draft" | "completed";
  captainA: string;
  captainB: string;
  aReady: boolean;
  bReady: boolean;
  revealedA: PptChoice | null;
  revealedB: PptChoice | null;
  lastTieChoice: PptChoice | null;
  tieCount: number;
  winner: string | null;
  currentTurn: "a" | "b" | null;
  turnNumber: number;
  picksInTurn: number;
  /** Ordem de escolha (o capitão é o 1º). */
  teamA: string[];
  teamB: string[];
}

export interface NextMix {
  schedule: Schedule;
  occurrence: Occurrence;
  organizer: string | null;
  registrations: Registration[];
  /** Quem saiu da lista desta ocorrência, na ordem das saídas. */
  departures: Departure[];
  votes: VoteSummary;
  draft: DraftView | null;
  tiebreaker: TiebreakerView;
  /** Atraso (s) da punição ativa de quem está vendo, se houver. */
  myPenaltyDelay: number | null;
  /** Partida finalizada desta ocorrência, se houver. */
  finalizedMatchId: string | null;
  /** Sugestão de times balanceados (seção 7), se ligada. */
  suggestion: SuggestionView | null;
  /** Chance do time A vencer, com os times completos. */
  draftProbA: number | null;
}

export type NextMixResult = { status: "not_configured" } | { status: "none" } | { status: "ok"; mix: NextMix };

const SCHEDULE_COLUMNS =
  "id, recurrence_kind, weekday, event_date, event_time, registration_opens_at, max_players, active, created_by, created_at";

export async function listSchedules(): Promise<Schedule[] | null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("mix_schedules")
    .select(SCHEDULE_COLUMNS)
    .eq("active", true)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Falha ao carregar a agenda de mixes: ${error.message}`);
  return (data as ScheduleRow[]).map(toSchedule);
}

async function displayNames(ids: string[]) {
  const supabase = await createSupabaseServerClient();
  if (!supabase || !ids.length) return new Map<string, string>();
  const { data } = await supabase.from("profiles").select("id, display_name").in("id", ids);
  return new Map((data ?? []).map((p) => [p.id as string, p.display_name as string]));
}

export async function listRegistrations(
  scheduleId: string,
  date: string,
  maxPlayers: number,
  viewerId: string | null = null,
): Promise<{ registrations: Registration[]; departures: Departure[]; votes: VoteSummary }> {
  const supabase = await createSupabaseServerClient();
  const empty = { maps: [], mapTally: [], captainTally: [], captainVotesCast: 0, mine: { maps: [], captains: [] } };
  if (!supabase) return { registrations: [], departures: [], votes: empty };
  const match = { schedule_id: scheduleId, event_date: date };

  const [regs, mapVotes, captainVotes, maps, cancels] = await Promise.all([
    supabase.from("mix_registrations").select("id, user_id, created_at, device").match(match).order("created_at"),
    supabase.from("map_votes").select("user_id, map_id").match(match),
    supabase.from("captain_votes").select("voter_id, candidate_id").match(match),
    listAllMaps().then((all) => ({ data: all.filter((m) => m.active).map((m) => ({ id: m.id, name: m.name })) })),
    supabase
      .from("mix_cancellations")
      .select("user_id, registered_at, cancelled_at, cancelled_by")
      .match(match)
      .order("cancelled_at"),
  ]);
  if (regs.error) throw new Error(`Falha ao carregar inscrições: ${regs.error.message}`);

  const rows = regs.data;
  const leftRows = cancels.data ?? []; // falha = sem o registro de saídas
  const classified = new Set(rows.slice(0, maxPlayers).map((r) => r.user_id as string));
  const people = [...new Set([...rows, ...leftRows].map((r) => r.user_id as string))];
  const [names, avatars] = await Promise.all([
    displayNames(
      [...new Set([...people, ...leftRows.map((c) => c.cancelled_by as string | null)])].filter(
        (id): id is string => !!id,
      ),
    ),
    profileAvatars(people),
  ]);
  const mapRows = (mapVotes.data ?? []).filter((v) => classified.has(v.user_id as string));
  const capRows = (captainVotes.data ?? []).filter(
    (v) => classified.has(v.voter_id as string) && classified.has(v.candidate_id as string),
  );
  const mapNames = new Map((maps.data ?? []).map((m) => [m.id as string, m.name as string]));

  const registrations = rows.map((r, i): Registration => {
    const uid = r.user_id as string;
    return {
      id: r.id as string,
      userId: uid,
      displayName: names.get(uid) ?? "Jogador",
      avatarUrl: avatars.get(uid)?.avatarUrl ?? null,
      createdAt: r.created_at as string,
      position: i + 1,
      status: i < maxPlayers ? "classified" : "reserve",
      device: (r.device as Registration["device"]) ?? null,
      mapVoted: mapRows.some((v) => v.user_id === uid),
      captainVotesGiven: capRows.filter((v) => v.voter_id === uid).length,
      captainVotesReceived: capRows.filter((v) => v.candidate_id === uid).length,
      penalty: null,
    };
  });

  const departures = leftRows.map((c): Departure => {
    const uid = c.user_id as string;
    const by = c.cancelled_by as string | null;
    return {
      userId: uid,
      displayName: names.get(uid) ?? "Jogador",
      avatarUrl: avatars.get(uid)?.avatarUrl ?? null,
      registeredAt: (c.registered_at as string | null) ?? null,
      leftAt: c.cancelled_at as string,
      removedBy: by && by !== uid ? (names.get(by) ?? "Admin") : null,
    };
  });

  return {
    registrations,
    departures,
    votes: {
      maps: (maps.data ?? []).map((m) => ({ id: m.id as string, name: m.name as string })),
      mapTally: tally(mapRows.map((v) => v.map_id as string)).map(([id, votes]) => ({
        id,
        name: mapNames.get(id) ?? id,
        votes,
      })),
      captainTally: tally(capRows.map((v) => v.candidate_id as string)).map(([userId, votes]) => ({
        userId,
        displayName: names.get(userId) ?? "Jogador",
        votes,
      })),
      captainVotesCast: capRows.length,
      mine: {
        maps: (mapVotes.data ?? []).filter((v) => v.user_id === viewerId).map((v) => v.map_id as string),
        captains: (captainVotes.data ?? []).filter((v) => v.voter_id === viewerId).map((v) => v.candidate_id as string),
      },
    },
  };
}

/** Datas de mix deletadas pelo admin ("agenda|data"). Falha aberta: sem a migração 0027, nada é pulado. */
async function cancelledOccurrences(): Promise<Set<string>> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return new Set();
  const { data, error } = await supabase.from("mix_skips").select("schedule_id, event_date");
  if (error) return new Set();
  return new Set((data ?? []).map((c) => `${c.schedule_id}|${c.event_date}`));
}

/** Próximo mix (a ocorrência atual mais próxima entre as agendas ativas). */
export async function getNextMix(viewerId: string | null = null, now = new Date()): Promise<NextMixResult> {
  if (!isAuthConfigured()) return { status: "not_configured" };
  const schedules = await listSchedules();
  if (!schedules) return { status: "not_configured" };

  const cancelled = await cancelledOccurrences();
  const upcoming = schedules
    .map((schedule) => ({
      schedule,
      occurrence: currentOccurrence(schedule, now, (date) => cancelled.has(`${schedule.id}|${date}`)),
    }))
    .filter((x): x is { schedule: Schedule; occurrence: Occurrence } => x.occurrence !== null)
    .sort((a, b) => a.occurrence.eventAt.getTime() - b.occurrence.eventAt.getTime());
  const next = upcoming[0];
  if (!next) return { status: "none" };

  const [{ registrations, departures, votes }, organizers, draft, features] = await Promise.all([
    listRegistrations(next.schedule.id, next.occurrence.date, next.schedule.maxPlayers, viewerId),
    displayNames(next.schedule.createdBy ? [next.schedule.createdBy] : []),
    loadDraft(next.schedule.id, next.occurrence.date),
    getFeatures(),
  ]);

  const classified = registrations.filter((r) => r.status === "classified").map((r) => r.userId);
  await syncSuggestion({
    scheduleId: next.schedule.id,
    date: next.occurrence.date,
    classified,
    maxPlayers: next.schedule.maxPlayers,
    enabled: features.team_suggestion,
    draftStarted: !!draft,
  });
  const ids = [...new Set([...registrations.map((r) => r.userId), ...(viewerId ? [viewerId] : [])])];
  const [penalties, tiebreaker, finalizedMatchId, suggestion, draftProbA] = await Promise.all([
    activePenalties(ids),
    loadTiebreaker(next.schedule.id, next.occurrence.date, votes, draft, features.map_tiebreaker, viewerId),
    loadFinalizedMatch(next.schedule.id, next.occurrence.date),
    loadSuggestion(next.schedule.id, next.occurrence.date, viewerId, classified),
    draft?.status === "completed" ? teamWinProbability(draft.teamA, draft.teamB) : null,
  ]);
  for (const r of registrations) {
    const p = penalties.get(r.userId);
    r.penalty = p ? { reason: p.reason, delaySeconds: p.delaySeconds } : null;
  }
  return {
    status: "ok",
    mix: {
      ...next,
      organizer: next.schedule.createdBy ? (organizers.get(next.schedule.createdBy) ?? null) : null,
      registrations,
      departures,
      votes,
      draft,
      tiebreaker,
      myPenaltyDelay: viewerId ? (penalties.get(viewerId)?.delaySeconds ?? null) : null,
      finalizedMatchId,
      suggestion,
      draftProbA,
    },
  };
}

export async function loadDraft(scheduleId: string, date: string): Promise<DraftView | null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const { data } = await supabase
    .from("mix_draft_state")
    .select("*")
    .match({ schedule_id: scheduleId, event_date: date })
    .maybeSingle();
  if (!data) return null;
  return {
    status: data.status,
    captainA: data.captain_a,
    captainB: data.captain_b,
    aReady: data.a_ready,
    bReady: data.b_ready,
    revealedA: data.revealed_a,
    revealedB: data.revealed_b,
    lastTieChoice: data.last_tie_choice,
    tieCount: data.tie_count,
    winner: data.winner,
    currentTurn: data.current_turn,
    turnNumber: data.turn_number,
    picksInTurn: data.picks_in_turn,
    teamA: data.team_a ?? [],
    teamB: data.team_b ?? [],
  };
}

export async function loadTiebreaker(
  scheduleId: string,
  date: string,
  votes: VoteSummary,
  draft: DraftView | null,
  enabled: boolean,
  viewerId: string | null,
): Promise<TiebreakerView> {
  const names = new Map(votes.maps.map((m) => [m.id, m.name]));
  const empty: TiebreakerView = { enabled, rounds: [], finalMaps: [], pending: false };
  const supabase = await createSupabaseServerClient();
  if (!supabase || draft?.status !== "completed") return empty;

  const { data: rounds } = await supabase
    .from("map_tiebreaker_rounds")
    .select("*")
    .match({ schedule_id: scheduleId, event_date: date })
    .order("round_number");
  const rows = (rounds ?? []) as RoundRow[];
  const { data: rvotes } = rows.length
    ? await supabase
        .from("map_tiebreaker_votes")
        .select("round_id, user_id, maps")
        .in(
          "round_id",
          rows.map((r) => r.id),
        )
    : { data: [] };

  const counts = new Map(votes.mapTally.map((m) => [m.id, m.votes]));
  const main = votes.maps.map((m) => ({ id: m.id, votes: counts.get(m.id) ?? 0 }));
  const result = finalMaps(main, rows, enabled);

  return {
    enabled,
    pending: result.pending,
    finalMaps: result.maps.map((id) => ({ id, name: names.get(id) ?? id, random: result.random.includes(id) })),
    rounds: rows.map((r) => {
      const mine = (rvotes ?? []).filter((v) => v.round_id === r.id);
      return {
        id: r.id,
        roundNumber: r.round_number,
        status: r.status,
        slots: r.slots,
        votesCast: mine.length,
        myVote: (mine.find((v) => v.user_id === viewerId)?.maps as string[] | undefined) ?? [],
        winning: r.winning_maps,
        random: r.random_maps,
        candidates: r.candidate_maps.map((id) => ({
          id,
          name: names.get(id) ?? id,
          votes: mine.filter((v) => (v.maps as string[]).includes(id)).length,
        })),
      };
    }),
  };
}

async function loadFinalizedMatch(scheduleId: string, date: string) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const { data } = await supabase
    .from("mix_matches")
    .select("id")
    .match({ schedule_id: scheduleId, event_date: date })
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

/** Ocorrências com inscritos ainda não finalizadas (mais recentes primeiro). */
export async function listPendingFinalization(limit = 6) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return [];
  const [{ data: regs }, { data: matches }, { data: schedules }] = await Promise.all([
    supabase
      .from("mix_registrations")
      .select("schedule_id, event_date")
      .order("event_date", { ascending: false })
      .limit(500),
    supabase.from("mix_matches").select("schedule_id, event_date"),
    supabase.from("mix_schedules").select(SCHEDULE_COLUMNS),
  ]);
  // Finalizados e descartados ("Deletar mix") não aparecem.
  const done = new Set([
    ...(matches ?? []).map((m) => `${m.schedule_id}|${m.event_date}`),
    ...(await cancelledOccurrences()),
  ]);
  const byId = new Map(((schedules ?? []) as ScheduleRow[]).map((r) => [r.id, toSchedule(r)]));
  const seen = new Map<string, { scheduleId: string; date: string; players: number; eventTime: string }>();
  for (const r of regs ?? []) {
    const key = `${r.schedule_id}|${r.event_date}`;
    if (done.has(key)) continue;
    const entry = seen.get(key);
    if (entry) entry.players += 1;
    else
      seen.set(key, {
        scheduleId: r.schedule_id as string,
        date: r.event_date as string,
        players: 1,
        eventTime: byId.get(r.schedule_id as string)?.eventTime ?? "",
      });
  }
  return [...seen.values()].slice(0, limit);
}

/** Dados de uma ocorrência específica (para a finalização). */
export async function getOccurrenceForFinalization(scheduleId: string, date: string) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const { data } = await supabase.from("mix_schedules").select(SCHEDULE_COLUMNS).eq("id", scheduleId).maybeSingle();
  if (!data) return null;
  const schedule = toSchedule(data as ScheduleRow);
  const [{ registrations, votes }, draft, features, finalizedMatchId] = await Promise.all([
    listRegistrations(scheduleId, date, schedule.maxPlayers),
    loadDraft(scheduleId, date),
    getFeatures(),
    loadFinalizedMatch(scheduleId, date),
  ]);
  const tiebreaker = await loadTiebreaker(scheduleId, date, votes, draft, features.map_tiebreaker, null);
  return { schedule, registrations, votes, draft, tiebreaker, finalizedMatchId };
}

export interface UpcomingOccurrence {
  scheduleId: string;
  date: string;
  eventAt: Date;
  opensAt: Date;
  eventTime: string;
  recurrence: string;
  maxPlayers: number;
  players: number;
}

/** Próxima data de cada agenda ativa (sem as deletadas), da mais próxima para a mais distante. */
export async function listUpcomingOccurrences(now = new Date()): Promise<UpcomingOccurrence[]> {
  if (!isAuthConfigured()) return [];
  const schedules = await listSchedules();
  if (!schedules?.length) return [];
  const cancelled = await cancelledOccurrences();
  const list = schedules
    .map((schedule) => ({
      schedule,
      occurrence: currentOccurrence(schedule, now, (date) => cancelled.has(`${schedule.id}|${date}`)),
    }))
    .filter((x): x is { schedule: Schedule; occurrence: Occurrence } => x.occurrence !== null);
  if (!list.length) return [];

  const supabase = await createSupabaseServerClient();
  const { data: regs } = await supabase!
    .from("mix_registrations")
    .select("schedule_id, event_date")
    .in(
      "schedule_id",
      list.map((x) => x.schedule.id),
    )
    .in("event_date", [...new Set(list.map((x) => x.occurrence.date))]);
  const count = new Map<string, number>();
  for (const r of regs ?? []) {
    const key = `${r.schedule_id}|${r.event_date}`;
    count.set(key, (count.get(key) ?? 0) + 1);
  }
  return list
    .map(({ schedule, occurrence }) => ({
      scheduleId: schedule.id,
      date: occurrence.date,
      eventAt: occurrence.eventAt,
      opensAt: occurrence.opensAt,
      eventTime: schedule.eventTime,
      recurrence: describeRecurrence(schedule.recurrence),
      maxPlayers: schedule.maxPlayers,
      players: count.get(`${schedule.id}|${occurrence.date}`) ?? 0,
    }))
    .sort((a, b) => a.eventAt.getTime() - b.eventAt.getTime());
}

/** Jogadores cadastrados fora da lista (para o super admin incluir). */
export async function playersOutsideList(registered: string[]) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return [];
  const { data } = await supabase.from("profiles").select("id, display_name").order("display_name");
  const out = new Set(registered);
  const rows = (data ?? []).filter((p) => !out.has(p.id as string));
  const avatars = await profileAvatars(rows.map((p) => p.id as string));
  return rows.map((p) => ({
    id: p.id as string,
    name: p.display_name as string,
    avatarUrl: avatars.get(p.id as string)?.avatarUrl ?? null,
  }));
}
