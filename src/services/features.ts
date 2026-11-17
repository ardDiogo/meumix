import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type FeatureKey =
  "map_tiebreaker" | "team_suggestion" | "background_music" | "strike_late_leave" | "strike_no_show";

/** Padrões usados se a tabela ainda não existir ou não tiver a chave. */
const DEFAULTS: Record<FeatureKey, boolean> = {
  map_tiebreaker: true,
  team_suggestion: false,
  background_music: false,
  // Faltas (docs/regras-do-mix.md): ligadas até o admin desligar.
  strike_late_leave: true,
  strike_no_show: true,
};

export async function getFeatures(): Promise<Record<FeatureKey, boolean>> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ...DEFAULTS };
  const { data } = await supabase.from("feature_settings").select("feature_key, enabled");
  const result = { ...DEFAULTS };
  for (const row of data ?? []) {
    if (row.feature_key in result) result[row.feature_key as FeatureKey] = !!row.enabled;
  }
  return result;
}
