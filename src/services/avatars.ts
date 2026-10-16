import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface ProfileSteam {
  avatarUrl: string | null;
  steamId: string | null;
  steamUrl: string | null;
}

/**
 * Foto e SteamID dos perfis. Falha aberta: sem a migração 0009 (ou com erro no
 * banco) devolve um mapa vazio e as telas mostram as iniciais.
 */
export async function profileAvatars(ids?: string[]): Promise<Map<string, ProfileSteam>> {
  const map = new Map<string, ProfileSteam>();
  if (ids && !ids.length) return map;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return map;
  let query = supabase.from("profiles").select("id, avatar_url, steam_id, steam_url");
  if (ids) query = query.in("id", [...new Set(ids)]);
  const { data, error } = await query;
  if (error) return map;
  for (const p of data ?? []) {
    map.set(p.id as string, {
      avatarUrl: (p.avatar_url as string | null) ?? null,
      steamId: (p.steam_id as string | null) ?? null,
      steamUrl: (p.steam_url as string | null) ?? null,
    });
  }
  return map;
}
