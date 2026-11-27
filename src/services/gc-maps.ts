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
export async function getGcCareer(since: Date | null = null): Promise<GcLine[]> {
  return (await getGcStats(since)).lines;
}

/**
 * Dados da GC da liga atual (a partir de `since`): a linha somada de cada jogador e,
 * por mapa, os rounds e quantos o lado CT venceu.
 */
export async function getGcStats(
  since: Date | null = null,
): Promise<{ lines: GcLine[]; sides: Record<string, { rounds: number; ctWins: number }> }> {
  const empty = { lines: [], sides: {} };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return empty;
  let query = supabase
    .from("match_gc_maps")
    .select("match_id, map_order, map_id, data")
    .order("match_id")
    .order("map_order")
    .limit(5000);
  // Só os mixes da liga atual.
  // Só os mixes da liga atual (e do período).
  const scope = await leagueScope();
  if ((scope && scope !== "all") || since) {
    let ids = supabase.from("mix_matches").select("id");
    if (scope && scope !== "all") ids = ids.eq("league_id", scope.id);
    if (since) ids = ids.gte("event_date", since.toISOString().slice(0, 10));
    const { data: rows } = await ids;
    if (!rows?.length) return empty;
    query = query.in(
      "match_id",
      rows.map((r) => r.id as string),
    );
  }
  const { data, error } = await query;
  if (error) return empty;
  const maps = (data ?? [])
    .map((r) => ({ ...(r.data as GcMapStored), mapId: r.map_id as string }))
    .filter((m) => Array.isArray(m.players) && Array.isArray(m.rounds));
  const sides: Record<string, { rounds: number; ctWins: number }> = {};
  for (const m of maps) {
    const s = (sides[m.mapId] ??= { rounds: 0, ctWins: 0 });
    for (const r of m.rounds) {
      if (!r.ct) continue;
      s.rounds += 1;
      if (r.w === r.ct) s.ctWins += 1;
    }
  }
  return { lines: aggregateGc(maps).filter((l) => l.userId), sides };
}
