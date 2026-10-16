import "server-only";
import { currentOccurrence, type Occurrence } from "@/lib/mix-schedule";
import { isAuthConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
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
}

export interface NextMix {
  schedule: Schedule;
  occurrence: Occurrence;
  organizer: string | null;
  registrations: Registration[];
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

export async function listRegistrations(scheduleId: string, date: string, maxPlayers: number): Promise<Registration[]> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("mix_registrations")
    .select("id, user_id, created_at")
    .eq("schedule_id", scheduleId)
    .eq("event_date", date)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Falha ao carregar inscrições: ${error.message}`);
  const names = await displayNames(data.map((r) => r.user_id as string));
  return data.map((r, i) => ({
    id: r.id as string,
    userId: r.user_id as string,
    displayName: names.get(r.user_id as string) ?? "Jogador",
    createdAt: r.created_at as string,
    position: i + 1,
    status: i < maxPlayers ? "classified" : "reserve",
  }));
}

/** Próximo mix (a ocorrência atual mais próxima entre as agendas ativas). */
export async function getNextMix(now = new Date()): Promise<NextMixResult> {
  if (!isAuthConfigured()) return { status: "not_configured" };
  const schedules = await listSchedules();
  if (!schedules) return { status: "not_configured" };

  const upcoming = schedules
    .map((schedule) => ({ schedule, occurrence: currentOccurrence(schedule, now) }))
    .filter((x): x is { schedule: Schedule; occurrence: Occurrence } => x.occurrence !== null)
    .sort((a, b) => a.occurrence.eventAt.getTime() - b.occurrence.eventAt.getTime());
  const next = upcoming[0];
  if (!next) return { status: "none" };

  const [registrations, organizers] = await Promise.all([
    listRegistrations(next.schedule.id, next.occurrence.date, next.schedule.maxPlayers),
    displayNames(next.schedule.createdBy ? [next.schedule.createdBy] : []),
  ]);
  return {
    status: "ok",
    mix: {
      ...next,
      organizer: next.schedule.createdBy ? (organizers.get(next.schedule.createdBy) ?? null) : null,
      registrations,
    },
  };
}
