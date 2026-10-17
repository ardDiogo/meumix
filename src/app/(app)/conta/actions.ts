"use server";

import { validatePassword } from "@/lib/auth/validation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkPassword, deleteAccount, passwordCheckMessage } from "@/services/account";
import { audit } from "@/services/audit";
import { getSession } from "@/services/auth";

export type AccountResult = { ok: boolean; message: string };

/** Troca a senha pedindo a atual; encerra as sessões em outros aparelhos. */
export async function changePassword(current: string, next: string, confirm: string): Promise<AccountResult> {
  const session = await getSession();
  if (!session) return { ok: false, message: "Entre na sua conta para continuar." };
  const admin = createSupabaseAdminClient();
  if (!admin) return { ok: false, message: "O servidor não está configurado." };

  const invalid = validatePassword(next);
  if (invalid) return { ok: false, message: invalid };
  if (next !== confirm) return { ok: false, message: "A confirmação não confere com a nova senha." };
  if (next === current) return { ok: false, message: "A nova senha precisa ser diferente da atual." };

  const check = await checkPassword(admin, session, current, "password_change");
  if (check !== "ok") return { ok: false, message: passwordCheckMessage[check] };

  const { error } = await admin.auth.admin.updateUserById(session.id, { password: next });
  if (error) return { ok: false, message: "Não foi possível trocar a senha. Tente de novo." };
  const supabase = await createSupabaseServerClient();
  await supabase?.auth.signOut({ scope: "others" });
  await audit({ action: "account.password_change", outcome: "success", actorId: session.id });
  return { ok: true, message: "Senha alterada. Outros aparelhos conectados foram desconectados." };
}

/**
 * Exclui a própria conta (exige a senha e a palavra EXCLUIR). Placares ficam
 * anonimizados como "Jogador removido"; o resto é apagado.
 */
export async function deleteMyAccount(password: string, confirmation: string): Promise<AccountResult> {
  const session = await getSession();
  if (!session) return { ok: false, message: "Entre na sua conta para continuar." };
  if (session.isSuperAdmin) {
    return {
      ok: false,
      message: "O super administrador não pode se excluir por aqui. Remova o e-mail de SUPER_ADMIN_EMAILS antes.",
    };
  }
  if (confirmation.trim().toUpperCase() !== "EXCLUIR") {
    return { ok: false, message: "Digite EXCLUIR para confirmar." };
  }
  const admin = createSupabaseAdminClient();
  if (!admin) return { ok: false, message: "O servidor não está configurado." };

  const check = await checkPassword(admin, session, password, "account_delete");
  if (check !== "ok") return { ok: false, message: passwordCheckMessage[check] };

  const result = await deleteAccount(admin, session.id);
  if (!result.ok) return { ok: false, message: result.message ?? "Não foi possível excluir a conta." };
  // Sem e-mail nem nick: o titular não existe mais.
  await audit({ action: "account.delete", outcome: "success", actorId: null, detail: { por: "titular" } });
  const supabase = await createSupabaseServerClient();
  await supabase?.auth.signOut({ scope: "local" });
  return { ok: true, message: "Conta excluída." };
}
