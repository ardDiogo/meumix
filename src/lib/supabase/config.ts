/** Configuração pública do Supabase. `null` enquanto as variáveis não forem definidas. */
export function supabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Chave nova (sb_publishable_...) ou a antiga "anon key".
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && anonKey ? { url, anonKey } : null;
}

export const isAuthConfigured = () => supabaseConfig() !== null;
