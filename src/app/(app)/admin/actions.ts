"use server";

import { parseSchedule, type ScheduleErrors } from "@/lib/mix-schedule";
import { getSession } from "@/services/auth";
import { canManageMixes } from "@/lib/auth/permissions";

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
