import type { CommunityRole } from "@/types/domain";

/** Papel do usuário na plataforma (coluna `profiles.role`). */
export type PlatformRole = "user" | "admin";

/** Usuário autenticado, como visto pelas regras de permissão. */
export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  role: PlatformRole;
  /** Definido por `SUPER_ADMIN_EMAILS` e exige e-mail confirmado. Pode nomear administradores. */
  isSuperAdmin: boolean;
  /** Papel do usuário na comunidade ativa, se for membro. */
  communityRole: CommunityRole | null;
}

const normalizeEmail = (email: string) => email.trim().toLowerCase();

/** Super administradores (variável `SUPER_ADMIN_EMAILS`, separada por vírgula). Somente servidor. */
export function superAdminEmails(raw = process.env.SUPER_ADMIN_EMAILS ?? "") {
  return raw.split(",").map(normalizeEmail).filter(Boolean);
}

export function isSuperAdminEmail(
  email: string | null | undefined,
  emailConfirmed: boolean,
  admins = superAdminEmails(),
) {
  return !!email && emailConfirmed && admins.includes(normalizeEmail(email));
}

/** Pode criar, editar e cancelar mixes. */
export function canManageMixes(user: SessionUser | null) {
  if (!user) return false;
  return user.isSuperAdmin || user.role === "admin" || user.communityRole === "owner" || user.communityRole === "admin";
}

/** Pode conceder e remover o papel de administrador. */
export function canManageAdmins(user: SessionUser | null) {
  return !!user?.isSuperAdmin;
}
