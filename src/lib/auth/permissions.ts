import type { CommunityRole } from "@/types/domain";

/** Usuário autenticado, como visto pelas regras de permissão. */
export interface SessionUser {
  id: string;
  email: string;
  /** Papel do usuário na comunidade ativa, se for membro. */
  communityRole: CommunityRole | null;
}

const normalizeEmail = (email: string) => email.trim().toLowerCase();

/** Lista de administradores da plataforma (variável `ADMIN_EMAILS`, separada por vírgula). */
export function platformAdminEmails(raw = process.env.ADMIN_EMAILS ?? "") {
  return raw.split(",").map(normalizeEmail).filter(Boolean);
}

export function isPlatformAdmin(user: SessionUser | null, admins = platformAdminEmails()) {
  return !!user && admins.includes(normalizeEmail(user.email));
}

/** Pode criar, editar e cancelar mixes da comunidade. */
export function canManageMixes(user: SessionUser | null) {
  if (!user) return false;
  return isPlatformAdmin(user) || user.communityRole === "owner" || user.communityRole === "admin";
}
