import "server-only";
import { cache } from "react";
import { leagueToday } from "@/lib/league";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Ligas com mix hoje pela agenda (semanal no dia de hoje ou data avulsa hoje), para
 * abrir o site nelas: um jogo da Lanterna numa quinta abre na Lanterna.
 */
export const leagueIdsWithMixToday = cache(async (): Promise<Set<string>> => {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return new Set();
  const today = leagueToday();
  const { data, error } = await supabase
    .from("mix_schedules")
    .select("community_id, recurrence_kind, weekday, event_date")
    .eq("active", true);
  if (error) return new Set();
  return new Set(
    (data ?? [])
      .filter((r) => (r.recurrence_kind === "weekly" ? r.weekday === today.weekday : r.event_date === today.date))
      .map((r) => r.community_id as string),
  );
});
