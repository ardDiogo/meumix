"use server";

import { revalidatePath } from "next/cache";
import { canManageMixes } from "@/lib/auth/permissions";
import { currentOccurrence, registrationWindow } from "@/lib/mix-schedule";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSession } from "@/services/auth";
import { toSchedule, type ScheduleRow } from "@/services/mix-events";

export type ActionResult = { ok: true; message: string } | { ok: false; message: string };

const fail = (message: string): ActionResult => ({ ok: false, message });

function refresh() {
  revalidatePath("/dashboard");
  revalidatePath("/admin");
}

/** Carrega a agenda e confirma que (agenda, data) é a ocorrência atual. */
async function loadOccurrence(scheduleId: string, date: string) {
  const admin = createSupabaseAdminClient();
  if (!admin) return { error: "Inscrições indisponíveis: servidor não configurado." } as const;
  const { data } = await admin.from("mix_schedules").select("*").eq("id", scheduleId).eq("active", true).maybeSingle();
  if (!data) return { error: "Este mix não está mais disponível." } as const;
  const schedule = toSchedule(data as ScheduleRow);
  const now = new Date();
  const occurrence = currentOccurrence(schedule, now);
  if (!occurrence || occurrence.date !== date) return { error: "Este mix não está mais disponível." } as const;
  return { admin, schedule, occurrence, window: registrationWindow(occurrence, now) } as const;
}

/** Inscreve o usuário logado no mix. */
export async function joinMix(scheduleId: string, date: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return fail("Entre na sua conta para participar do mix.");

  const ctx = await loadOccurrence(scheduleId, date);
  if ("error" in ctx) return fail(ctx.error!);
  if (ctx.window === "not_open") return fail("As inscrições para este mix ainda não abriram.");
  if (ctx.window === "closed") return fail("As inscrições para este mix já foram encerradas.");

  const { error } = await ctx.admin
    .from("mix_registrations")
    .insert({ schedule_id: scheduleId, event_date: date, user_id: session.id });
  if (error?.code === "23505") return fail("Você já está inscrito neste mix.");
  if (error) return fail("Não foi possível concluir a inscrição. Tente novamente.");

  refresh();
  return { ok: true, message: "Inscrição confirmada!" };
}

/** Cancela a inscrição do usuário logado (até o início do mix). */
export async function leaveMix(scheduleId: string, date: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return fail("Entre na sua conta para gerenciar sua inscrição.");

  const ctx = await loadOccurrence(scheduleId, date);
  if ("error" in ctx) return fail(ctx.error!);
  if (ctx.window === "closed") return fail("O mix já começou; a inscrição não pode mais ser cancelada.");

  const { error } = await ctx.admin
    .from("mix_registrations")
    .delete()
    .eq("schedule_id", scheduleId)
    .eq("event_date", date)
    .eq("user_id", session.id);
  if (error) return fail("Não foi possível cancelar a inscrição.");

  refresh();
  return { ok: true, message: "Inscrição cancelada." };
}

/** Admin: remove um inscrito. */
export async function removeRegistration(registrationId: string): Promise<ActionResult> {
  if (!canManageMixes(await getSession())) return fail("Apenas administradores podem remover inscritos.");
  const admin = createSupabaseAdminClient();
  if (!admin) return fail("Servidor não configurado.");
  const { error } = await admin.from("mix_registrations").delete().eq("id", registrationId);
  if (error) return fail("Não foi possível remover o inscrito.");
  refresh();
  return { ok: true, message: "Inscrito removido." };
}

/** Admin: apaga todas as inscrições da ocorrência atual. */
export async function resetRegistrations(scheduleId: string, date: string): Promise<ActionResult> {
  if (!canManageMixes(await getSession())) return fail("Apenas administradores podem reiniciar o mix.");
  const admin = createSupabaseAdminClient();
  if (!admin) return fail("Servidor não configurado.");
  const { error } = await admin.from("mix_registrations").delete().eq("schedule_id", scheduleId).eq("event_date", date);
  if (error) return fail("Não foi possível reiniciar as inscrições.");
  refresh();
  return { ok: true, message: "Inscrições reiniciadas." };
}
