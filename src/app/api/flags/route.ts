import { getFeatures } from "@/services/features";
import { getAppSetting } from "@/services/settings";

export const dynamic = "force-dynamic";

/** Chaves de funcionalidade e música (consulta leve a cada 10 s, além do tempo real). */
export async function GET() {
  const [features, musicUrl] = await Promise.all([getFeatures(), getAppSetting("music_url")]);
  return Response.json({ features, musicUrl }, { headers: { "cache-control": "no-store" } });
}
