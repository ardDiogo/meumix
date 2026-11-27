import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { AUDIT_LABELS, PLAYER_ACTION_PREFIXES, PLAYER_ACTIONS } from "@/lib/audit-labels";

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
  /** "admin": só administração; "jogadores": só ações dos jogadores. */
  group?: "admin" | "jogadores";
  /** A partir de quando. */
  since?: Date | null;
  /** Busca no nick de quem fez e no nome da ação. */
  q?: string;
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
  if (opts.since) query = query.gte("created_at", opts.since.toISOString());
  const playerList = `(${PLAYER_ACTIONS.join(",")})`;
  if (opts.group === "admin") {
    for (const p of PLAYER_ACTION_PREFIXES) query = query.not("action", "like", `${p}%`);
    query = query.not("action", "in", playerList);
  }
  if (opts.group === "jogadores") {
    query = query.or([...PLAYER_ACTION_PREFIXES.map((p) => `action.like.${p}%`), `action.in.${playerList}`].join(","));
  }
  const [{ data: profiles }, { data: badges }] = await Promise.all([
    admin.from("profiles").select("id, display_name"),
    admin.from("badges").select("id, name"),
  ]);
  // Busca: nick de quem fez ou nome da ação (em português).
  const q = opts.q
    ?.trim()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
  if (q) {
    const norm = (t: string) =>
      t
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toLowerCase();
    const actors = (profiles ?? [])
      .filter((p) => norm(p.display_name as string).includes(q))
      .map((p) => p.id as string);
    const actions = Object.entries(AUDIT_LABELS)
      .filter(([k, v]) => norm(v).includes(q) || k.includes(q))
      .map(([k]) => k);
    if (!actors.length && !actions.length) return { rows: [], hasMore: false, names: new Map() };
    query = query.or(
      [
        actors.length ? `actor_id.in.(${actors.join(",")})` : null,
        actions.length ? `action.in.(${actions.join(",")})` : null,
      ]
        .filter(Boolean)
        .join(","),
    );
  }
  const { data, error } = await query;
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
