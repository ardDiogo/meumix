import { cronUnauthorized } from "@/lib/cron-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Retenção do log de auditoria (docs/seguranca, P-02), chamada uma vez por dia
 * pelo cron da Vercel (vercel.json). A Vercel envia `Authorization: Bearer <CRON_SECRET>`.
 */
export async function GET(request: Request) {
  const denied = cronUnauthorized(request);
  if (denied) return denied;
  const admin = createSupabaseAdminClient();
  if (!admin) return Response.json({ ok: false, error: "banco não configurado" }, { status: 503 });
  const { data, error } = await admin.rpc("purge_audit_log");
  if (error) {
    console.error("[retencao]", error.code, error.message);
    return Response.json({ ok: false, error: error.code }, { status: 500 });
  }
  // Registro dos avisos já enviados (só serve para não repetir): 30 dias bastam.
  await admin
    .from("push_log")
    .delete()
    .lt("created_at", new Date(Date.now() - 30 * 86_400_000).toISOString());
  return Response.json({ ok: true, ...(data as Record<string, number>) });
}
