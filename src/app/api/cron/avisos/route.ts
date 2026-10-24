import { cronUnauthorized } from "@/lib/cron-auth";
import { runScheduledNotices } from "@/services/notify";

export const dynamic = "force-dynamic";

/**
 * Avisos por horário (inscrições abrindo, vagas, bolão fechando, lives).
 * Chamado a cada 5 minutos por um agendador externo (cron-job.org) com
 * `Authorization: Bearer <CRON_SECRET>`; cada aviso sai uma vez só.
 */
export async function GET(request: Request) {
  const denied = cronUnauthorized(request);
  if (denied) return denied;
  const result = await runScheduledNotices();
  return Response.json(result, { status: result.ok ? 200 : 500 });
}
