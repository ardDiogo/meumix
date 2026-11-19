import "server-only";
import { fetchSteamProfile, SteamTemporaryError } from "@/lib/integrations/steam";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Fotos da Steam que ficaram para depois (perfil vinculado enquanto a Steam limitava
 * as consultas). Roda no cron de avisos, poucos perfis por vez, para não esbarrar no limite.
 */
export async function syncPendingSteamAvatars(limit = 3) {
  const admin = createSupabaseAdminClient();
  if (!admin) return 0;
  const { data, error } = await admin
    .from("profiles")
    .select("id, steam_id")
    .not("steam_id", "is", null)
    .is("steam_synced_at", null)
    .limit(limit);
  if (error) return 0;
  let done = 0;
  for (const p of data ?? []) {
    try {
      const profile = await fetchSteamProfile({ kind: "id64", value: p.steam_id as string });
      await admin
        .from("profiles")
        .update({ avatar_url: profile.avatarUrl, steam_synced_at: new Date().toISOString() })
        .eq("id", p.id);
      done++;
    } catch (e) {
      // Ainda limitando: tenta no próximo cron. Outro erro (perfil some): marca para não insistir.
      if (e instanceof SteamTemporaryError) break;
      await admin.from("profiles").update({ steam_synced_at: new Date().toISOString() }).eq("id", p.id);
    }
  }
  return done;
}
