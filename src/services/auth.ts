import "server-only";
import { canManageMixes, type SessionUser } from "@/lib/auth/permissions";

/**
 * Sessão do usuário atual.
 *
 * A autenticação (Supabase Auth) ainda NÃO está implementada, então em
 * produção não existe sessão e nenhuma ação administrativa é liberada.
 *
 * Somente em desenvolvimento local é possível simular uma sessão com
 * `MEUMIX_DEV_SESSION_EMAIL` para visualizar telas restritas.
 */
export async function getSession(): Promise<SessionUser | null> {
  const devEmail = process.env.MEUMIX_DEV_SESSION_EMAIL;
  if (process.env.NODE_ENV !== "production" && devEmail) {
    return { id: "dev-user", email: devEmail, communityRole: null };
  }
  return null;
}

export async function getPermissions() {
  const session = await getSession();
  return { session, canManageMixes: canManageMixes(session) };
}
