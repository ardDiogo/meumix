import "server-only";
import type { GcMapStored } from "@/lib/gc-api";
import { aggregateGc, type GcLine } from "@/lib/gc-analysis";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { leagueScope } from "./league";

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

/**
 * Dados da GC somados de todos os mixes da liga, um por jogador do MeuMix (convidados
 * ficam de fora). Página Estatísticas; sem a migração 0035, vazio.
 */
export async function getGcCareer(): Promise<GcLine[]> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return [];
  let query = supabase
    .from("match_gc_maps")
    .select("match_id, map_order, map_id, data")
    .order("match_id")
    .order("map_order")
    .limit(5000);
  // Só os mixes da liga atual.
  const scope = await leagueScope();
  if (scope && scope !== "all") {
    const { data: ids } = await supabase.from("mix_matches").select("id").eq("league_id", scope.id);
    if (!ids?.length) return [];
    query = query.in(
      "match_id",
      ids.map((r) => r.id as string),
    );
  }
  const { data, error } = await query;
  if (error) return [];
  const maps = (data ?? [])
    .map((r) => ({ ...(r.data as GcMapStored), mapId: r.map_id as string }))
    .filter((m) => Array.isArray(m.players) && Array.isArray(m.rounds));
  return aggregateGc(maps).filter((l) => l.userId);
}
