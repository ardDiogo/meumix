import "server-only";
import { currentOccurrence, type Occurrence } from "@/lib/mix-schedule";
import { isAuthConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { tally } from "@/lib/mix-rules";
import type { MixRecurrence, Weekday } from "@/types/domain";

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

export interface NextMix {
  schedule: Schedule;
  occurrence: Occurrence;
  organizer: string | null;
  registrations: Registration[];
  votes: VoteSummary;
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
): Promise<{ registrations: Registration[]; votes: VoteSummary }> {
  const supabase = await createSupabaseServerClient();
  const empty = { maps: [], mapTally: [], captainTally: [], captainVotesCast: 0, mine: { maps: [], captains: [] } };
  if (!supabase) return { registrations: [], votes: empty };
  const match = { schedule_id: scheduleId, event_date: date };

  const [regs, mapVotes, captainVotes, maps] = await Promise.all([
    supabase.from("mix_registrations").select("id, user_id, created_at, device").match(match).order("created_at"),
    supabase.from("map_votes").select("user_id, map_id").match(match),
    supabase.from("captain_votes").select("voter_id, candidate_id").match(match),
    supabase.from("maps").select("id, name").eq("active", true).order("name"),
  ]);
  if (regs.error) throw new Error(`Falha ao carregar inscrições: ${regs.error.message}`);

  const rows = regs.data;
  const classified = new Set(rows.slice(0, maxPlayers).map((r) => r.user_id as string));
  const names = await displayNames(rows.map((r) => r.user_id as string));
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
      createdAt: r.created_at as string,
      position: i + 1,
      status: i < maxPlayers ? "classified" : "reserve",
      device: (r.device as Registration["device"]) ?? null,
      mapVoted: mapRows.some((v) => v.user_id === uid),
      captainVotesGiven: capRows.filter((v) => v.voter_id === uid).length,
      captainVotesReceived: capRows.filter((v) => v.candidate_id === uid).length,
    };
  });

  return {
    registrations,
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

/** Próximo mix (a ocorrência atual mais próxima entre as agendas ativas). */
export async function getNextMix(viewerId: string | null = null, now = new Date()): Promise<NextMixResult> {
  if (!isAuthConfigured()) return { status: "not_configured" };
  const schedules = await listSchedules();
  if (!schedules) return { status: "not_configured" };

  const upcoming = schedules
    .map((schedule) => ({ schedule, occurrence: currentOccurrence(schedule, now) }))
    .filter((x): x is { schedule: Schedule; occurrence: Occurrence } => x.occurrence !== null)
    .sort((a, b) => a.occurrence.eventAt.getTime() - b.occurrence.eventAt.getTime());
  const next = upcoming[0];
  if (!next) return { status: "none" };

  const [{ registrations, votes }, organizers] = await Promise.all([
    listRegistrations(next.schedule.id, next.occurrence.date, next.schedule.maxPlayers, viewerId),
    displayNames(next.schedule.createdBy ? [next.schedule.createdBy] : []),
  ]);
  return {
    status: "ok",
    mix: {
      ...next,
      organizer: next.schedule.createdBy ? (organizers.get(next.schedule.createdBy) ?? null) : null,
      registrations,
      votes,
    },
  };
}
