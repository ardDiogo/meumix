import "server-only";
import { mapName } from "@/lib/maps";
import type { MapId } from "@/types/domain";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface ManagedMap {
  id: string;
  name: string;
  shortName: string | null;
  active: boolean;
  sortOrder: number;
}

/** Todos os mapas cadastrados, na ordem do admin. Sem a migração 0010 usa a ordem alfabética. */
export async function listAllMaps(): Promise<ManagedMap[]> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return [];
  const full = await supabase
    .from("maps")
    .select("id, name, short_name, active, sort_order")
    .order("sort_order")
    .order("name");
  if (!full.error) {
    return (full.data ?? []).map((m) => ({
      id: m.id as string,
      name: m.name as string,
      shortName: (m.short_name as string | null) ?? null,
      active: !!m.active,
      sortOrder: (m.sort_order as number) ?? 0,
    }));
  }
  const { data } = await supabase.from("maps").select("id, name, active").order("name");
  return (data ?? []).map((m, i) => ({
    id: m.id as string,
    name: (m.name as string) ?? mapName(m.id as MapId),
    shortName: null,
    active: !!m.active,
    sortOrder: i + 1,
  }));
}
