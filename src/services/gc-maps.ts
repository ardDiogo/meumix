import "server-only";
import type { GcMapStored } from "@/lib/gc-api";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Estatísticas da GC de um mix, na ordem dos mapas (sem a migração 0035 ou sem importação: vazio). */
export async function getGcMaps(matchId: string): Promise<GcMapStored[]> {
  if (!/^[0-9a-f-]{36}$/i.test(matchId)) return [];
  const supabase = await createSupabaseServerClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("match_gc_maps")
    .select("map_order, map_id, data")
    .eq("match_id", matchId)
    .order("map_order");
  if (error) return [];
  return (data ?? [])
    .map((r) => ({ ...(r.data as GcMapStored), mapId: r.map_id as string }))
    .filter((m) => Array.isArray(m.players) && Array.isArray(m.rounds));
}
