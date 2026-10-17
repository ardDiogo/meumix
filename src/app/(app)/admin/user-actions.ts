"use server";

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { canManageAdmins, canManageMixes, isSuperAdminEmail } from "@/lib/auth/permissions";
import { validateDisplayName, validatePassword } from "@/lib/auth/validation";
import { fetchSteamProfile, parseSteamInput } from "@/lib/integrations/steam";
import { ELO_CAP, levelForElo } from "@/lib/levels";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { audit } from "@/services/audit";
import { getSession } from "@/services/auth";
import { confirmLinkUrl, getOrCreateConfirmToken } from "@/services/confirm-links";
import { getLevels } from "@/services/levels";

export type UserActionResult = { ok: true; message: string } | { ok: false; message: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Carrega o alvo e confere a hierarquia: administradores gerenciam jogadores;
 * só o master gerencia administradores; o master não é alterado por aqui.
 */
async function authorize(userId: string) {
  const session = await getSession();
  if (!canManageMixes(session)) return { error: "Apenas administradores podem gerenciar usuários." } as const;
  const admin = createSupabaseAdminClient();
  if (!admin) return { error: "Gestão de usuários não configurada no servidor." } as const;

  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data.user) return { error: "Usuário não encontrado." } as const;
  const target = data.user;
  const targetIsMaster = isSuperAdminEmail(target.email, !!target.email_confirmed_at);
  const { data: profile } = await admin.from("profiles").select("role, elo, level").eq("id", userId).maybeSingle();
  const targetIsAdmin = profile?.role === "admin";
  const isSelf = session!.id === userId;

  if (targetIsMaster && !isSelf) return { error: "O super administrador não pode ser alterado por aqui." } as const;
  if (targetIsAdmin && !isSelf && !canManageAdmins(session)) {
    return { error: "Apenas o master pode alterar outro administrador." } as const;
  }
  return { session: session!, admin, target, profile, isSelf } as const;
}

function refresh() {
  revalidatePath("/", "layout");
}

/* ------------------------------ Editar dados ------------------------------ */

export interface UserDataInput {
  nick: string;
  fullName: string;
  email: string;
  steam: string;
}

export async function updateUserData(userId: string, input: UserDataInput): Promise<UserActionResult> {
  const auth = await authorize(userId);
  if ("error" in auth) return { ok: false, message: auth.error! };
  const { admin, target, session } = auth;

  const nick = input.nick.trim().replace(/\s+/g, " ");
  const fullName = input.fullName.trim().replace(/\s+/g, " ");
  const email = input.email.trim().toLowerCase();
  const nickError = validateDisplayName(nick);
  if (nickError) return { ok: false, message: nickError };
  if (fullName.length > 80) return { ok: false, message: "Nome muito longo." };
  if (!EMAIL.test(email)) return { ok: false, message: "E-mail inválido." };
  if (email !== (target.email ?? "").toLowerCase() && isSuperAdminEmail(target.email, true)) {
    return { ok: false, message: "O e-mail do super administrador não pode ser trocado por aqui." };
  }

  // Steam: só busca de novo se o link mudou.
  const { data: current } = await admin.from("profiles").select("steam_url").eq("id", userId).maybeSingle();
  const steamInput = input.steam.trim();
  let steamPatch: Record<string, unknown> = {};
  if (!steamInput) {
    if (current?.steam_url) steamPatch = { steam_id: null, steam_url: null, avatar_url: null, steam_synced_at: null };
  } else {
    const parsed = parseSteamInput(steamInput);
    if (!parsed) return { ok: false, message: "Link da Steam inválido. Ex.: https://steamcommunity.com/id/seunick" };
    const sameLink =
      current?.steam_url && parsed.kind === "id64" && current.steam_url.endsWith(`/profiles/${parsed.value}`);
    if (!sameLink) {
      try {
        const p = await fetchSteamProfile(parsed);
        steamPatch = {
          steam_id: p.steamId,
          steam_url: p.profileUrl,
          avatar_url: p.avatarUrl,
          steam_synced_at: new Date().toISOString(),
        };
      } catch (e) {
        return {
          ok: false,
          message: `Não foi possível ler o perfil na Steam (${e instanceof Error ? e.message : "erro"}).`,
        };
      }
    }
  }

  if (email !== (target.email ?? "").toLowerCase()) {
    const { error } = await admin.auth.admin.updateUserById(userId, { email, email_confirm: true });
    if (error) {
      return {
        ok: false,
        message: /already|registered|exists/i.test(error.message)
          ? "Esse e-mail já está em uso por outra conta."
          : "Não foi possível alterar o e-mail.",
      };
    }
  }

  const { error } = await admin
    .from("profiles")
    .update({ display_name: nick, full_name: fullName || null, ...steamPatch })
    .eq("id", userId);
  if (error) {
    return {
      ok: false,
      message:
        error.code === "23505"
          ? "Esse perfil Steam já está vinculado a outro jogador."
          : error.code === "42703"
            ? "Rode as migrações 0008 e 0009 no Supabase."
            : "Não foi possível salvar.",
    };
  }
  await admin.auth.admin.updateUserById(userId, {
    user_metadata: { ...target.user_metadata, display_name: nick, full_name: fullName || null },
  });
  await audit({ action: "admin.user_edit", outcome: "success", actorId: session.id, detail: { userId, nick } });
  refresh();
  return { ok: true, message: `Dados de ${nick} salvos.` };
}

/* ------------------------------- Editar ELO ------------------------------- */

export async function updateUserElo(userId: string, elo: number, gcLevel?: number | null): Promise<UserActionResult> {
  const auth = await authorize(userId);
  if ("error" in auth) return { ok: false, message: auth.error! };
  const { admin, profile, session } = auth;
  if (!Number.isInteger(elo) || elo < 0 || elo > ELO_CAP) {
    return { ok: false, message: `O ELO deve ser um número inteiro de 0 a ${ELO_CAP}.` };
  }
  if (gcLevel != null && (!Number.isInteger(gcLevel) || gcLevel < 0 || gcLevel > 20)) {
    return { ok: false, message: "Nível GC inválido." };
  }
  const level = levelForElo(elo, await getLevels()).level;
  const oldElo = (profile?.elo as number | undefined) ?? 0;
  const { error } = await admin
    .from("profiles")
    .update({ elo, level, last_elo_change: elo - oldElo, ...(gcLevel != null ? { gc_level: gcLevel } : {}) })
    .eq("id", userId);
  if (error) return { ok: false, message: "Não foi possível salvar o ELO." };
  await admin.from("elo_change_logs").insert({
    user_id: userId,
    old_elo: oldElo,
    new_elo: elo,
    old_level: profile?.level ?? null,
    new_level: level,
    reason: "ajuste manual",
    changed_by: session.id,
  });
  await audit({
    action: "admin.elo_edit",
    outcome: "success",
    actorId: session.id,
    detail: { userId, from: oldElo, to: elo },
  });
  refresh();
  return { ok: true, message: `ELO atualizado: ${oldElo} → ${elo} (nível ${level}).` };
}

/* ------------------------------ Resetar senha ------------------------------ */

/** Senha temporária legível (sem caracteres ambíguos). */
export async function suggestPassword(): Promise<string> {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  const pick = (n: number) => Array.from({ length: n }, () => chars[randomInt(chars.length)]).join("");
  return `mix-${pick(4)}-${pick(4)}`;
}

export async function resetUserPassword(userId: string, password: string): Promise<UserActionResult> {
  const auth = await authorize(userId);
  if ("error" in auth) return { ok: false, message: auth.error! };
  const invalid = validatePassword(password);
  if (invalid) return { ok: false, message: invalid };
  const { error } = await auth.admin.auth.admin.updateUserById(userId, { password });
  if (error) return { ok: false, message: "Não foi possível redefinir a senha." };
  await audit({ action: "admin.password_reset", outcome: "success", actorId: auth.session.id, detail: { userId } });
  return { ok: true, message: "Senha redefinida. Envie a nova senha ao jogador em particular." };
}

/* ------------------------------ Excluir usuário ------------------------------ */

export async function deleteUser(userId: string): Promise<UserActionResult> {
  const auth = await authorize(userId);
  if ("error" in auth) return { ok: false, message: auth.error! };
  if (auth.isSelf) return { ok: false, message: "Você não pode excluir a própria conta por aqui." };
  const { error } = await auth.admin.auth.admin.deleteUser(userId);
  if (error) return { ok: false, message: "Não foi possível excluir o usuário." };
  await audit({
    action: "admin.user_delete",
    outcome: "success",
    actorId: auth.session.id,
    detail: { userId, email: auth.target.email },
  });
  refresh();
  return { ok: true, message: "Usuário excluído. O histórico de partidas foi mantido." };
}

/* --------------------------- Link pessoal (sem login) --------------------------- */

export type ConfirmLinkResult = { ok: true; message: string; url: string } | { ok: false; message: string };

/** Link pessoal de confirmação do jogador; `rotate` gera um novo e invalida o antigo. */
export async function getConfirmLink(userId: string, rotate = false): Promise<ConfirmLinkResult> {
  const auth = await authorize(userId);
  if ("error" in auth) return { ok: false, message: auth.error! };
  const token = await getOrCreateConfirmToken(userId, rotate);
  if (!token) return { ok: false, message: "Rode a migração 0017_confirm_links.sql no Supabase." };
  if (rotate) {
    await audit({
      action: "admin.rotate_confirm_link",
      outcome: "success",
      actorId: auth.session.id,
      detail: { user_id: userId },
    });
  }
  return {
    ok: true,
    message: rotate ? "Novo link gerado; o anterior parou de funcionar." : "",
    url: await confirmLinkUrl(token),
  };
}
