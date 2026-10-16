"use server";

import { revalidatePath } from "next/cache";
import { canManageAdmins, canManageMixes, isSuperAdminEmail, type PlatformRole } from "@/lib/auth/permissions";
import { parseSchedule, type ScheduleErrors } from "@/lib/mix-schedule";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSession } from "@/services/auth";

export type CreateMixState =
  | { status: "idle" }
  | { status: "invalid"; errors: ScheduleErrors }
  | { status: "denied"; message: string }
  | { status: "not_persisted"; message: string };

/**
 * Cria um evento de mix. A permissão é SEMPRE verificada aqui no servidor —
 * esconder o botão na interface não é suficiente.
 */
export async function createMixSchedule(_prev: CreateMixState, formData: FormData): Promise<CreateMixState> {
  const session = await getSession();
  if (!canManageMixes(session)) {
    return { status: "denied", message: "Apenas administradores podem criar mixes." };
  }

  const today = new Date().toISOString().slice(0, 10);
  const { errors } = parseSchedule(
    {
      recurrence: String(formData.get("recurrence") ?? ""),
      date: String(formData.get("date") ?? ""),
      eventTime: String(formData.get("eventTime") ?? ""),
      registrationOpensAt: String(formData.get("registrationOpensAt") ?? ""),
    },
    today,
  );
  if (Object.keys(errors).length) return { status: "invalid", errors };

  // TODO: gravar em `mix_schedules` quando a fonte Supabase estiver implementada.
  return {
    status: "not_persisted",
    message: "Dados válidos, mas o mix não foi salvo: o banco de dados ainda não está conectado.",
  };
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
