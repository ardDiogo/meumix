import type { CookieOptions } from "@supabase/ssr";

/**
 * Cookie que indica "não lembrar de mim". Quando presente, os cookies de
 * sessão do Supabase são gravados sem validade (expiram ao fechar o navegador).
 */
export const REMEMBER_COOKIE = "mm-remember";

export function sessionCookieOptions(options: CookieOptions, remember: boolean): CookieOptions {
  if (remember) return options;
  // Mantém remoções (maxAge 0) e transforma o resto em cookie de sessão.
  if (options.maxAge === 0) return options;
  return { ...options, maxAge: undefined, expires: undefined };
}
