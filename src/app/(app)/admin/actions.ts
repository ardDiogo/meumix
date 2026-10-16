"use server";

import { revalidatePath } from "next/cache";
import { canManageAdmins, canManageMixes, isSuperAdminEmail, type PlatformRole } from "@/lib/auth/permissions";
import { communityToday, describeRecurrence, parseSchedule, type ScheduleErrors } from "@/lib/mix-schedule";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { audit } from "@/services/audit";
import { getSession } from "@/services/auth";
import { DEFAULT_COMMUNITY_SLUG } from "@/services/mix-events";

export type CreateMixState =
  | { status: "idle" }
  | { status: "invalid"; errors: ScheduleErrors }
  | { status: "error"; message: string }
  | { status: "saved"; message: string };

/**
 * Cria um evento de mix. A permissão é SEMPRE verificada aqui no servidor —
 * esconder o botão na interface não é suficiente.
 */
export async function createMixSchedule(_prev: CreateMixState, formData: FormData): Promise<CreateMixState> {
  const session = await getSession();
  if (!canManageMixes(session)) {
    return { status: "error", message: "Apenas administradores podem criar mixes." };
  }

  const input = {
    recurrence: String(formData.get("recurrence") ?? ""),
    date: String(formData.get("date") ?? ""),
    eventTime: String(formData.get("eventTime") ?? ""),
    registrationOpensAt: String(formData.get("registrationOpensAt") ?? ""),
  };
  const { recurrence, errors } = parseSchedule(input, communityToday(new Date()));
  if (Object.keys(errors).length) return { status: "invalid", errors };

  const admin = createSupabaseAdminClient();
  if (!admin) return { status: "error", message: "O banco de dados não está configurado no servidor." };

  const { data: community } = await admin
    .from("communities")
    .select("id")
    .eq("slug", DEFAULT_COMMUNITY_SLUG)
    .maybeSingle();
  if (!community) return { status: "error", message: "Comunidade padrão não encontrada. Rode a migração 0003." };

  const { error } = await admin.from("mix_schedules").insert({
    community_id: community.id,
    recurrence_kind: recurrence.kind,
    weekday: recurrence.kind === "weekly" ? recurrence.weekday : null,
    event_date: recurrence.kind === "once" ? recurrence.date : null,
    event_time: input.eventTime,
    registration_opens_at: input.registrationOpensAt,
    created_by: session!.id,
  });
  if (error) return { status: "error", message: "Não foi possível salvar o mix. Tente novamente." };

  revalidatePath("/admin");
  revalidatePath("/dashboard");
  return { status: "saved", message: `Mix criado: ${describeRecurrence(recurrence)} às ${input.eventTime}.` };
}

/** Desativa uma agenda de mix (deixa de aparecer para inscrições). */
export async function deactivateSchedule(scheduleId: string): Promise<RoleChangeResult> {
  if (!canManageMixes(await getSession()))
    return { ok: false, message: "Apenas administradores podem encerrar mixes." };
  const admin = createSupabaseAdminClient();
  if (!admin) return { ok: false, message: "O banco de dados não está configurado no servidor." };
  const { error } = await admin.from("mix_schedules").update({ active: false }).eq("id", scheduleId);
  if (error) return { ok: false, message: "Não foi possível encerrar o mix." };
  revalidatePath("/admin");
  revalidatePath("/dashboard");
  return { ok: true, message: "Mix encerrado." };
}

export type RoleChangeResult = { ok: true; message: string } | { ok: false; message: string };

/** Concede ou remove o papel de administrador. Somente super admins. */
export async function setUserRole(userId: string, role: PlatformRole): Promise<RoleChangeResult> {
  const session = await getSession();
  if (!canManageAdmins(session)) return { ok: false, message: "Apenas o super administrador pode alterar papéis." };
  if (role !== "admin" && role !== "user") return { ok: false, message: "Papel inválido." };

  const admin = createSupabaseAdminClient();
  if (!admin) return { ok: false, message: "Gestão de usuários não configurada no servidor." };

  const { data: target, error: findError } = await admin.auth.admin.getUserById(userId);
  if (findError || !target.user) return { ok: false, message: "Usuário não encontrado." };
  if (isSuperAdminEmail(target.user.email, !!target.user.email_confirmed_at)) {
    return { ok: false, message: "O papel do super administrador não pode ser alterado aqui." };
  }

  if (role === "admin" && !target.user.email_confirmed_at) {
    return { ok: false, message: "O usuário precisa confirmar o e-mail antes de virar administrador." };
  }

  const { error } = await admin.from("profiles").update({ role }).eq("id", userId);
  if (error) return { ok: false, message: "Não foi possível salvar a alteração." };

  revalidatePath("/admin");
  const name = target.user.email ?? "usuário";
  return {
    ok: true,
    message: role === "admin" ? `${name} agora é administrador.` : `${name} não é mais administrador.`,
  };
}

/* ------------------------------- Punições -------------------------------- */

export type PenaltyState =
  { status: "idle" } | { status: "error"; message: string } | { status: "saved"; message: string };

/** Cria uma punição (só master / super admin). */
export async function createPenalty(_prev: PenaltyState, fd: FormData): Promise<PenaltyState> {
  const session = await getSession();
  if (!canManageAdmins(session)) return { status: "error", message: "Apenas o master pode aplicar punições." };
  const userId = String(fd.get("userId") ?? "");
  const delay = Number(fd.get("delaySeconds"));
  const reason = String(fd.get("reason") ?? "").trim();
  const expires = String(fd.get("expiresAt") ?? "");
  if (!userId) return { status: "error", message: "Selecione o jogador." };
  if (!Number.isInteger(delay) || delay < 30 || delay > 3600) {
    return { status: "error", message: "O atraso deve ficar entre 30 segundos e 1 hora." };
  }
  if (reason.length < 3) return { status: "error", message: "Informe o motivo da punição." };
  const expiresAt = expires ? new Date(`${expires}T23:59:59-03:00`) : null;
  if (expiresAt && expiresAt.getTime() < Date.now())
    return { status: "error", message: "A data de expiração já passou." };

  const admin = createSupabaseAdminClient();
  if (!admin) return { status: "error", message: "O banco de dados não está configurado no servidor." };
  const { error } = await admin.from("user_penalties").insert({
    user_id: userId,
    delay_seconds: delay,
    reason,
    expires_at: expiresAt?.toISOString() ?? null,
    applied_by: session!.id,
  });
  if (error) return { status: "error", message: "Não foi possível aplicar a punição." };
  await audit({
    action: "admin.penalty_create",
    outcome: "success",
    actorId: session!.id,
    detail: { user_id: userId, delay, reason, expires },
  });
  revalidatePath("/admin");
  revalidatePath("/dashboard");
  return { status: "saved", message: "Punição aplicada." };
}

/** Desativa uma punição (só master). */
export async function deactivatePenalty(penaltyId: string): Promise<RoleChangeResult> {
  const session = await getSession();
  if (!canManageAdmins(session)) return { ok: false, message: "Apenas o master pode remover punições." };
  const admin = createSupabaseAdminClient();
  if (!admin) return { ok: false, message: "O banco de dados não está configurado no servidor." };
  const { error } = await admin.from("user_penalties").update({ is_active: false }).eq("id", penaltyId);
  if (error) return { ok: false, message: "Não foi possível remover a punição." };
  await audit({
    action: "admin.penalty_deactivate",
    outcome: "success",
    actorId: session!.id,
    detail: { penalty_id: penaltyId },
  });
  revalidatePath("/admin");
  revalidatePath("/dashboard");
  return { ok: true, message: "Punição removida." };
}

/* ------------------------ Chaves de funcionalidades ----------------------- */

/** Liga/desliga uma funcionalidade (admin). */
export async function setFeature(key: "map_tiebreaker", enabled: boolean): Promise<RoleChangeResult> {
  const session = await getSession();
  if (!canManageMixes(session)) return { ok: false, message: "Apenas administradores podem alterar funcionalidades." };
  const admin = createSupabaseAdminClient();
  if (!admin) return { ok: false, message: "O banco de dados não está configurado no servidor." };
  const { error } = await admin
    .from("feature_settings")
    .upsert({ feature_key: key, enabled, updated_by: session!.id, updated_at: new Date().toISOString() });
  if (error) return { ok: false, message: "Não foi possível salvar." };
  await audit({ action: "admin.feature_toggle", outcome: "success", actorId: session!.id, detail: { key, enabled } });
  revalidatePath("/admin");
  revalidatePath("/dashboard");
  return { ok: true, message: enabled ? "Funcionalidade ligada." : "Funcionalidade desligada." };
}
