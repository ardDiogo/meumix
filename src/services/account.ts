import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseConfig } from "@/lib/supabase/config";
import { audit } from "./audit";

/** Tentativas erradas de senha (troca de senha / exclusão) antes de bloquear por 15 minutos. */
const MAX_WRONG = 5;
const WINDOW_MS = 15 * 60_000;

export type PasswordCheck = "ok" | "wrong" | "locked" | "unavailable";

/**
 * Confere a senha atual do usuário num cliente separado (não mexe na sessão do
 * navegador) e encerra a sessão de teste em seguida. Bloqueia após 5 erros em 15 min.
 */
export async function checkPassword(
  admin: SupabaseClient,
  user: { id: string; email: string },
  password: string,
  purpose: "password_change" | "account_delete",
): Promise<PasswordCheck> {
  const config = supabaseConfig();
  if (!config || !user.email) return "unavailable";

  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const { count } = await admin
    .from("audit_log")
    .select("id", { count: "exact", head: true })
    .eq("actor_id", user.id)
    .eq("action", "account.password_check")
    .eq("outcome", "wrong")
    .gte("created_at", since);
  if ((count ?? 0) >= MAX_WRONG) return "locked";

  const probe = createClient(config.url, config.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await probe.auth.signInWithPassword({ email: user.email, password });
  if (data.session) await probe.auth.signOut({ scope: "local" });
  const ok = !error && data.user?.id === user.id;
  await audit({
    action: "account.password_check",
    outcome: ok ? "success" : "wrong",
    actorId: user.id,
    detail: { purpose },
  });
  return ok ? "ok" : "wrong";
}

export const passwordCheckMessage: Record<Exclude<PasswordCheck, "ok">, string> = {
  wrong: "Senha atual incorreta.",
  locked: "Muitas tentativas com a senha errada. Aguarde 15 minutos e tente de novo.",
  unavailable: "Não foi possível conferir a senha agora. Tente mais tarde.",
};

/**
 * Apaga a conta: anonimiza placares e log (função 0024) e remove o usuário do
 * Auth — o perfil e os dados ligados a ele saem em cascata.
 */
export async function deleteAccount(admin: SupabaseClient, userId: string): Promise<{ ok: boolean; message?: string }> {
  const { error: rpcError } = await admin.rpc("anonymize_account", { p_user: userId });
  if (rpcError) {
    const missing = rpcError.code === "PGRST202" || rpcError.code === "42883";
    return {
      ok: false,
      message: missing
        ? "Rode a migração 0024_account_deletion.sql no Supabase."
        : "Não foi possível anonimizar os dados.",
    };
  }
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return { ok: false, message: "Não foi possível excluir a conta. Tente de novo." };
  return { ok: true };
}

/** Tabelas com dados do titular para o download (só linhas do próprio usuário). */
const OWN_ROWS: { table: string; column: string; label: string }[] = [
  { table: "mix_registrations", column: "user_id", label: "inscricoes" },
  { table: "map_votes", column: "user_id", label: "votos_de_mapa" },
  { table: "captain_votes", column: "voter_id", label: "votos_de_capitao" },
  { table: "mix_team_suggestion_votes", column: "user_id", label: "votos_de_sugestao_de_times" },
  { table: "map_tiebreaker_votes", column: "user_id", label: "votos_de_desempate" },
  { table: "player_match_records", column: "user_id", label: "estatisticas_por_partida" },
  { table: "elo_change_logs", column: "user_id", label: "historico_de_elo" },
  { table: "player_badges", column: "user_id", label: "insignias" },
  { table: "user_penalties", column: "user_id", label: "penalidades" },
  { table: "clips", column: "user_id", label: "clipes" },
  { table: "player_ai_analyses", column: "user_id", label: "analises_csrep" },
  { table: "audit_log", column: "actor_id", label: "registro_de_acoes" },
];

/** Cópia dos dados pessoais do titular (LGPD, art. 18, II e V). */
export async function exportAccountData(admin: SupabaseClient, userId: string) {
  const [{ data: auth }, { data: profile }, { data: link }, ...rows] = await Promise.all([
    admin.auth.admin.getUserById(userId),
    admin.from("profiles").select("*").eq("id", userId).maybeSingle(),
    admin.from("confirm_links").select("created_at").eq("user_id", userId).maybeSingle(),
    ...OWN_ROWS.map(({ table, column }) => admin.from(table).select("*").eq(column, userId).limit(5000)),
  ]);
  const u = auth?.user;
  return {
    gerado_em: new Date().toISOString(),
    aviso:
      "Cópia dos seus dados pessoais no MeuMix. Placares de partidas mostram só as suas linhas; dados de outros jogadores não são incluídos.",
    conta: u
      ? {
          id: u.id,
          email: u.email,
          email_confirmado_em: u.email_confirmed_at ?? null,
          criada_em: u.created_at,
          ultimo_login_em: u.last_sign_in_at ?? null,
          termos_aceitos: u.user_metadata?.terms_version
            ? { versao: u.user_metadata.terms_version, em: u.user_metadata.terms_accepted_at ?? null }
            : null,
        }
      : null,
    perfil: profile ?? null,
    link_pessoal_de_confirmacao: link ? { existe: true, criado_em: link.created_at } : { existe: false },
    ...Object.fromEntries(
      OWN_ROWS.map(({ label }, i) => [
        label,
        rows[i]?.error
          ? { erro: "não foi possível ler esta parte; peça pelo e-mail de contato" }
          : (rows[i]?.data ?? []),
      ]),
    ),
  };
}
