import { cronUnauthorized } from "@/lib/cron-auth";
import { recomputeBadges } from "@/services/badge-sync";

export const dynamic = "force-dynamic";

/** Recalcula as insígnias automáticas uma vez por dia (rede de segurança além do recálculo após cada ação). */
export async function GET(request: Request) {
  const denied = cronUnauthorized(request);
  if (denied) return denied;
  const result = await recomputeBadges();
  return Response.json(result, { status: result.ok ? 200 : 500 });
}
