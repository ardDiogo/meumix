import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export interface Penalty {
  id: string;
  userId: string;
  delaySeconds: number;
  reason: string;
  expiresAt: string | null;
  createdAt: string;
}

type Row = {
  id: string;
  user_id: string;
  delay_seconds: number;
  reason: string;
  expires_at: string | null;
  created_at: string;
};

const toPenalty = (r: Row): Penalty => ({
  id: r.id,
  userId: r.user_id,
  delaySeconds: r.delay_seconds,
  reason: r.reason,
  expiresAt: r.expires_at,
  createdAt: r.created_at,
});

/**
 * Punições ativas dos usuários informados. Punições vencidas são desativadas
 * automaticamente. Em caso de erro devolve vazio (fail-open: não trava ninguém).
 */
export async function activePenalties(userIds?: string[]): Promise<Map<string, Penalty>> {
  const result = new Map<string, Penalty>();
  try {
    const admin = createSupabaseAdminClient();
    if (!admin) return result;
    let query = admin.from("user_penalties").select("*").eq("is_active", true);
    if (userIds) {
      if (!userIds.length) return result;
      query = query.in("user_id", userIds);
    }
    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) return result;

    const now = Date.now();
    const expired: string[] = [];
    for (const row of data as Row[]) {
      if (row.expires_at && new Date(row.expires_at).getTime() < now) {
        expired.push(row.id);
        continue;
      }
      const current = result.get(row.user_id);
      // Com várias punições ativas, vale a de maior atraso.
      if (!current || row.delay_seconds > current.delaySeconds) result.set(row.user_id, toPenalty(row));
    }
    if (expired.length) await admin.from("user_penalties").update({ is_active: false }).in("id", expired);
  } catch (e) {
    console.error("[penalties] falha ao consultar punições", e);
  }
  return result;
}
