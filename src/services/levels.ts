import "server-only";
import { cache } from "react";
import { LEVELS, type LevelDef } from "@/lib/levels";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Faixas de nível configuradas no admin (`level_configs`); padrão se indisponível. */
export const getLevels = cache(async (): Promise<LevelDef[]> => {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return [...LEVELS];
  const { data, error } = await supabase.from("level_configs").select("level, elo_min, elo_max, color").order("level");
  if (error || data?.length !== 10) return [...LEVELS];
  return data.map((r) => ({
    level: r.level as number,
    min: r.elo_min as number,
    max: r.elo_max as number,
    color: r.color as string,
  }));
});
