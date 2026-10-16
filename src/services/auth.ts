import "server-only";
import { cache } from "react";
import {
  canManageAdmins,
  canManageMixes,
  isSuperAdminEmail,
  type PlatformRole,
  type SessionUser,
} from "@/lib/auth/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Sessão do usuário atual (Supabase Auth). Deduplicada por requisição.
 *
 * Sem Supabase configurado, apenas em desenvolvimento local é possível
 * simular uma sessão com `MEUMIX_DEV_SESSION_EMAIL`.
 */
export const getSession = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return devSession();

  const { data, error } = await supabase.auth.getUser();
  const user = data.user;
  if (error || !user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, role")
    .eq("id", user.id)
    .maybeSingle();
  const email = user.email ?? "";

  return {
    id: user.id,
    email,
    displayName:
      profile?.display_name ?? (user.user_metadata?.display_name as string | undefined) ?? email.split("@")[0]!,
    role: profile?.role === "admin" ? "admin" : "user",
    isSuperAdmin: isSuperAdminEmail(email, !!user.email_confirmed_at),
    communityRole: null,
  };
});

function devSession(): SessionUser | null {
  const email = process.env.MEUMIX_DEV_SESSION_EMAIL;
  if (process.env.NODE_ENV === "production" || !email) return null;
  return {
    id: "dev-user",
    email,
    displayName: email.split("@")[0]!,
    role: "user" satisfies PlatformRole,
    isSuperAdmin: isSuperAdminEmail(email, true),
    communityRole: null,
  };
}

export async function getPermissions() {
  const session = await getSession();
  return { session, canManageMixes: canManageMixes(session), canManageAdmins: canManageAdmins(session) };
}
