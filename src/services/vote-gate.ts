import "server-only";
import { currentOccurrence } from "@/lib/mix-schedule";
import { MAP_VOTES_PER_PLAYER } from "@/lib/mix-rules";
import { queueOrder } from "@/lib/strikes";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { toSchedule, type ScheduleRow } from "./mix-events";

export interface PendingVote {
  /** "Segunda-feira, 23/11 às 21:00" */
  when: string;
  captains: boolean;
  maps: boolean;
}

const TZ = "America/Sao_Paulo";

/**
 * Classificado de um mix com a lista fechada que ainda não votou (capitães e/ou mapas):
 * o site fica bloqueado até votar. Barato para quem não está inscrito (1 consulta).
 * Falha = null (não bloqueia ninguém por erro).
 */
export async function pendingVote(userId: string | null | undefined): Promise<PendingVote | null> {
  try {
    const admin = createSupabaseAdminClient();
    if (!userId || !admin) return null;
    const since = new Date(Date.now() - 36 * 3600_000).toISOString().slice(0, 10);
    const { data: mine } = await admin
      .from("mix_registrations")
      .select("schedule_id, event_date")
      .eq("user_id", userId)
      .gte("event_date", since);
    if (!mine?.length) return null;

    const now = new Date();
    for (const reg of mine) {
      const pending = await pendingVoteIn(userId, reg.schedule_id as string, reg.event_date as string, now);
      if (pending) return pending;
    }
    return null;
  } catch (e) {
    console.error("[vote-gate]", e);
    return null;
  }
}

/** O mesmo, num mix específico (ex.: para recusar a saída de quem não votou). */
export async function pendingVoteIn(
  userId: string,
  scheduleId: string,
  date: string,
  now = new Date(),
): Promise<PendingVote | null> {
  const admin = createSupabaseAdminClient();
  if (!admin) return null;
  const match = { schedule_id: scheduleId, event_date: date };
  const { data: row } = await admin.from("mix_schedules").select("*").eq("id", scheduleId).maybeSingle();
  if (!row || row.active === false) return null;
  const schedule = toSchedule(row as ScheduleRow);
  const occurrence = currentOccurrence(schedule, now);
  if (!occurrence || occurrence.date !== date) return null;

  const [{ data: regs }, { data: done }] = await Promise.all([
    admin.from("mix_registrations").select("*").match(match).order("created_at"),
    admin.from("mix_matches").select("id").match(match).limit(1),
  ]);
  if (done?.length) return null;
  const classified = queueOrder(regs ?? [])
    .slice(0, schedule.maxPlayers)
    .map((r) => r.user_id as string);
  if (classified.length < schedule.maxPlayers || !classified.includes(userId)) return null;

  const [{ data: draft }, { data: rounds }, { count: captainVotes }, { count: mapVotes }] = await Promise.all([
    admin.from("mix_draft_state").select("status").match(match).maybeSingle(),
    admin.from("map_tiebreaker_rounds").select("id").match(match).limit(1),
    admin
      .from("captain_votes")
      .select("voter_id", { count: "exact", head: true })
      .match({ ...match, voter_id: userId }),
    admin
      .from("map_votes")
      .select("user_id", { count: "exact", head: true })
      .match({ ...match, user_id: userId }),
  ]);
  // As mesmas regras da janela de votação: capitães até a disputa começar; mapas até fechar.
  const captains = !draft && !captainVotes;
  const maps = !rounds?.length && (mapVotes ?? 0) !== MAP_VOTES_PER_PLAYER;
  if (!captains && !maps) return null;
  const at = occurrence.eventAt;
  const weekday = at.toLocaleDateString("pt-BR", { weekday: "long", timeZone: TZ });
  const when = `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}, ${at.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: TZ,
  })} às ${at.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: TZ })}`;
  return { when, captains, maps };
}
