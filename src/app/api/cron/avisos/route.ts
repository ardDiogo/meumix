import { cronUnauthorized } from "@/lib/cron-auth";
import { runScheduledNotices } from "@/services/notify";
import { syncPendingSteamAvatars } from "@/services/steam-pending";

export const dynamic = "force-dynamic";

/**
 * Avisos por horário (inscrições abrindo, vagas, bolão fechando, lives) e fotos
 * da Steam pendentes.
 * Chamado a cada 5 minutos por um agendador externo (cron-job.org) com
 * `Authorization: Bearer <CRON_SECRET>`; cada aviso sai uma vez só.
 */
export async function GET(request: Request) {
  const denied = cronUnauthorized(request);
  if (denied) return denied;
  const [result, steamAvatars] = await Promise.all([
    runScheduledNotices(),
    // Fotos da Steam que ficaram para depois (a Steam estava limitando as consultas).
    syncPendingSteamAvatars().catch(() => 0),
  ]);
  return Response.json({ ...result, steamAvatars }, { status: result.ok ? 200 : 500 });
}
