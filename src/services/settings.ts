import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Lê uma configuração geral (`app_settings`). Falha aberta: devolve null. */
export async function getAppSetting(key: string): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const { data, error } = await supabase.from("app_settings").select("value").eq("key", key).maybeSingle();
  if (error) return null;
  return (data?.value as string | null) ?? null;
}
