import "server-only";
import { isSuperAdminEmail, type PlatformRole } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export interface ManagedUser {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
  emailConfirmed: boolean;
  role: PlatformRole;
  isSuperAdmin: boolean;
}

export type ListUsersResult =
  { status: "ok"; users: ManagedUser[] } | { status: "not_configured" } | { status: "error"; message: string };

/** Lista contas para o super admin. Requer `SUPABASE_SERVICE_ROLE_KEY`. Chame só após checar a permissão. */
export async function listManagedUsers(): Promise<ListUsersResult> {
  const admin = createSupabaseAdminClient();
  if (!admin) return { status: "not_configured" };

  const [{ data, error }, profiles] = await Promise.all([
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    admin.from("profiles").select("id, display_name, role"),
  ]);
  if (error) return { status: "error", message: "Não foi possível carregar os usuários." };

  const byId = new Map((profiles.data ?? []).map((p) => [p.id as string, p]));
  const users = data.users.map((u): ManagedUser => {
    const profile = byId.get(u.id);
    const email = u.email ?? "";
    return {
      id: u.id,
      email,
      displayName:
        profile?.display_name ?? (u.user_metadata?.display_name as string | undefined) ?? email.split("@")[0]!,
      createdAt: u.created_at,
      emailConfirmed: !!u.email_confirmed_at,
      role: profile?.role === "admin" ? "admin" : "user",
      isSuperAdmin: isSuperAdminEmail(email, !!u.email_confirmed_at),
    };
  });
  users.sort(
    (a, b) =>
      Number(b.isSuperAdmin) - Number(a.isSuperAdmin) ||
      (a.role === b.role ? a.email.localeCompare(b.email) : a.role === "admin" ? -1 : 1),
  );
  return { status: "ok", users };
}
