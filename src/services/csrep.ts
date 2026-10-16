import "server-only";
import { csrepUrlFor, type CsrepMetrics, type PlayerAnalysis } from "@/lib/csrep";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface CsrepView {
  /** Link salvo; sem ele, o montado pelo SteamID. */
  url: string | null;
  savedUrl: string | null;
  latest: { metrics: CsrepMetrics; analysis: PlayerAnalysis; createdAt: string } | null;
  /** false = falta a migração 0013. */
  available: boolean;
}

export async function getCsrepView(userId: string, steamId: string | null): Promise<CsrepView> {
  const fallback = { url: csrepUrlFor(steamId), savedUrl: null, latest: null, available: false };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return fallback;
  const [profile, analyses] = await Promise.all([
    supabase.from("profiles").select("csrep_url").eq("id", userId).maybeSingle(),
    supabase
      .from("player_ai_analyses")
      .select("metrics, analysis, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);
  if (profile.error || analyses.error) return fallback;
  const saved = (profile.data?.csrep_url as string | null) ?? null;
  const row = analyses.data?.[0];
  return {
    url: saved ?? csrepUrlFor(steamId),
    savedUrl: saved,
    latest: row
      ? {
          metrics: row.metrics as CsrepMetrics,
          analysis: row.analysis as PlayerAnalysis,
          createdAt: row.created_at as string,
        }
      : null,
    available: true,
  };
}
