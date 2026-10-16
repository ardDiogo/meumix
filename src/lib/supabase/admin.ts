import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseConfig } from "./config";

/**
 * Cliente com a chave secreta (service role) — ignora RLS. Use SOMENTE no servidor,
 * depois de verificar a permissão do usuário. Retorna `null` sem a chave.
 */
export function createSupabaseAdminClient() {
  const config = supabaseConfig();
  // Chave nova (sb_secret_...) ou a antiga "service_role".
  const serviceKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!config || !serviceKey) return null;
  return createClient(config.url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
