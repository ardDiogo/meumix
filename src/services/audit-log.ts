import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export interface AuditRow {
  id: number;
  action: string;
  outcome: string;
  actorId: string | null;
  actorName: string | null;
  eventDate: string | null;
  detail: Record<string, unknown> | null;
  createdAt: string;
}

export const AUDIT_PAGE_SIZE = 50;

/** Logs de auditoria (somente servidor, chave secreta), do mais recente para o mais antigo. */
export async function listAuditLog(opts: {
  category?: string;
  outcome?: "success" | "other";
  actorId?: string;
  page?: number;
}): Promise<{ rows: AuditRow[]; hasMore: boolean; names: Map<string, string> } | null> {
  const admin = createSupabaseAdminClient();
  if (!admin) return null;
  const page = Math.max(1, opts.page ?? 1);
  let query = admin
    .from("audit_log")
    .select("id, action, outcome, actor_id, event_date, detail, created_at")
    .order("created_at", { ascending: false })
    .range((page - 1) * AUDIT_PAGE_SIZE, page * AUDIT_PAGE_SIZE); // um a mais: indica a próxima página
  if (opts.category) query = query.like("action", `${opts.category}.%`);
  if (opts.outcome === "success") query = query.eq("outcome", "success");
  if (opts.outcome === "other") query = query.neq("outcome", "success");
  if (opts.actorId) query = query.eq("actor_id", opts.actorId);
  const [{ data, error }, { data: profiles }, { data: badges }] = await Promise.all([
    query,
    admin.from("profiles").select("id, display_name"),
    admin.from("badges").select("id, name"),
  ]);
  if (error) return null;
  // Ids nos detalhes viram nomes (jogadores e insígnias).
  const names = new Map([
    ...(badges ?? []).map((b) => [b.id as string, b.name as string] as const),
    ...(profiles ?? []).map((p) => [p.id as string, p.display_name as string] as const),
  ]);
  const rows = (data ?? []).map((r) => ({
    id: r.id as number,
    action: r.action as string,
    outcome: r.outcome as string,
    actorId: (r.actor_id as string | null) ?? null,
    actorName: r.actor_id ? (names.get(r.actor_id as string) ?? null) : null,
    eventDate: (r.event_date as string | null) ?? null,
    detail: (r.detail as Record<string, unknown> | null) ?? null,
    createdAt: r.created_at as string,
  }));
  return { rows: rows.slice(0, AUDIT_PAGE_SIZE), hasMore: rows.length > AUDIT_PAGE_SIZE, names };
}
