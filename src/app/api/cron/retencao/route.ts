import { timingSafeEqual } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Retenção do log de auditoria (docs/seguranca, P-02), chamada uma vez por dia
 * pelo cron da Vercel (vercel.json). A Vercel envia `Authorization: Bearer <CRON_SECRET>`.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return Response.json({ ok: false, error: "CRON_SECRET não configurado" }, { status: 503 });
  const got = Buffer.from(request.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  if (got.length !== want.length || !timingSafeEqual(got, want)) {
    return Response.json({ ok: false }, { status: 401 });
  }
  const admin = createSupabaseAdminClient();
  if (!admin) return Response.json({ ok: false, error: "banco não configurado" }, { status: 503 });
  const { data, error } = await admin.rpc("purge_audit_log");
  if (error) {
    console.error("[retencao]", error.code, error.message);
    return Response.json({ ok: false, error: error.code }, { status: 500 });
  }
  return Response.json({ ok: true, ...(data as Record<string, number>) });
}
