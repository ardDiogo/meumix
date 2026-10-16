import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export interface AuditEntry {
  action: string;
  outcome: string;
  actorId?: string | null;
  scheduleId?: string | null;
  eventDate?: string | null;
  detail?: Record<string, unknown>;
}

/** Registra uma ação sensível. Falhas de log nunca interrompem a ação principal. */
export async function audit(entry: AuditEntry) {
  try {
    const admin = createSupabaseAdminClient();
    if (!admin) return;
    await admin.from("audit_log").insert({
      action: entry.action,
      outcome: entry.outcome,
      actor_id: entry.actorId ?? null,
      schedule_id: entry.scheduleId ?? null,
      event_date: entry.eventDate ?? null,
      detail: entry.detail ?? null,
    });
  } catch (e) {
    console.error("[audit] falha ao registrar", entry.action, e);
  }
}
