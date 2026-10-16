import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseConfig } from "./config";
import { REMEMBER_COOKIE, sessionCookieOptions } from "./cookies";

/**
 * Cliente Supabase para Server Components, Server Actions e Route Handlers.
 * Retorna `null` quando o Supabase não está configurado.
 */
export async function createSupabaseServerClient({ remember }: { remember?: boolean } = {}) {
  const config = supabaseConfig();
  if (!config) return null;
  const cookieStore = await cookies();
  const keep = remember ?? cookieStore.get(REMEMBER_COOKIE)?.value !== "0";

  return createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, sessionCookieOptions(options, keep));
          }
        } catch {
          // Server Components não podem gravar cookies; o proxy renova a sessão.
        }
      },
    },
  });
}
