"use server";

import { revalidatePath } from "next/cache";
import { canManageMixes } from "@/lib/auth/permissions";
import { fetchSteamProfile, parseSteamInput } from "@/lib/integrations/steam";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { audit } from "@/services/audit";
import { getSession } from "@/services/auth";
import { confirmLinkUrl, getOrCreateConfirmToken } from "@/services/confirm-links";
import { resolveTwitchLogin } from "@/services/twitch";
import type { ConfirmLinkResult } from "../admin/user-actions";

export type SteamResult =
  { ok: true; message: string; avatarUrl: string | null; steamUrl: string | null } | { ok: false; message: string };

/** O próprio jogador ou um administrador. */
async function authorize(targetUserId?: string) {
  const session = await getSession();
  if (!session) return { error: "Entre na sua conta para continuar." } as const;
  const userId = targetUserId ?? session.id;
  if (userId !== session.id && !canManageMixes(session)) {
    return { error: "Apenas administradores podem alterar o perfil de outro jogador." } as const;
  }
  const admin = createSupabaseAdminClient();
  if (!admin) return { error: "O banco de dados não está configurado no servidor." } as const;
  return { session, userId, admin } as const;
}

function dbError(error: { code?: string } | null) {
  if (error?.code === "23505") return "Esse perfil Steam já está vinculado a outro jogador.";
  if (error?.code === "42703") return "Rode a migração 0009_steam.sql no Supabase para ativar a foto da Steam.";
  return "Não foi possível salvar.";
}

function refresh() {
  revalidatePath("/", "layout");
}

/** Vincula o perfil Steam (link, SteamID64 ou apelido) e importa a foto. */
export async function linkSteamProfile(input: string, targetUserId?: string): Promise<SteamResult> {
  const auth = await authorize(targetUserId);
  if ("error" in auth) return { ok: false, message: auth.error! };

  const parsed = parseSteamInput(input);
  if (!parsed) {
    return { ok: false, message: "Cole o link do perfil, ex.: https://steamcommunity.com/id/seunick" };
  }

  let profile;
  try {
    profile = await fetchSteamProfile(parsed);
  } catch (e) {
    const reason = e instanceof Error ? e.message : "erro desconhecido";
    return { ok: false, message: `Não foi possível ler o perfil na Steam (${reason}).` };
  }

  const { error } = await auth.admin
    .from("profiles")
    .update({
      steam_id: profile.steamId,
      steam_url: profile.profileUrl,
      avatar_url: profile.avatarUrl,
      steam_synced_at: new Date().toISOString(),
    })
    .eq("id", auth.userId);
  if (error) return { ok: false, message: dbError(error) };

  await audit({
    action: "profile.steam_link",
    outcome: "success",
    actorId: auth.session.id,
    detail: { userId: auth.userId, steamId: profile.steamId },
  });
  refresh();
  return {
    ok: true,
    message: profile.avatarUrl
      ? `Perfil Steam vinculado${profile.nickname ? ` (${profile.nickname})` : ""}.`
      : "Perfil vinculado, mas a Steam não retornou foto.",
    avatarUrl: profile.avatarUrl,
    steamUrl: profile.profileUrl,
  };
}

export async function unlinkSteamProfile(targetUserId?: string): Promise<SteamResult> {
  const auth = await authorize(targetUserId);
  if ("error" in auth) return { ok: false, message: auth.error! };
  const { error } = await auth.admin
    .from("profiles")
    .update({ steam_id: null, steam_url: null, avatar_url: null, steam_synced_at: null })
    .eq("id", auth.userId);
  if (error) return { ok: false, message: dbError(error) };
  refresh();
  return { ok: true, message: "Perfil Steam removido.", avatarUrl: null, steamUrl: null };
}

/** O próprio jogador: link pessoal de confirmação; `rotate` gera um novo. */
export async function myConfirmLink(rotate = false): Promise<ConfirmLinkResult> {
  const session = await getSession();
  if (!session) return { ok: false, message: "Entre na sua conta para continuar." };
  const token = await getOrCreateConfirmToken(session.id, rotate);
  if (!token) return { ok: false, message: "Link pessoal indisponível no momento." };
  if (rotate) await audit({ action: "profile.rotate_confirm_link", outcome: "success", actorId: session.id });
  return {
    ok: true,
    message: rotate ? "Novo link gerado; o anterior parou de funcionar." : "",
    url: await confirmLinkUrl(token),
  };
}

export type TwitchResult = { ok: true; message: string; login: string | null } | { ok: false; message: string };

/**
 * Canal da Twitch (link twitch.tv/canal ou só o nome). Vazio remove.
 * Com a Twitch configurada, confere se o canal existe.
 */
export async function setTwitchChannel(input: string, targetUserId?: string): Promise<TwitchResult> {
  const auth = await authorize(targetUserId);
  if ("error" in auth) return { ok: false, message: auth.error! };
  const result = await resolveTwitchLogin(input);
  if (!result.ok) return result;
  const { login } = result;

  const { error } = await auth.admin.from("profiles").update({ twitch_login: login }).eq("id", auth.userId);
  if (error) {
    return {
      ok: false,
      message:
        error.code === "23505"
          ? "Esse canal da Twitch já está cadastrado para outro jogador."
          : error.code === "42703" || error.code === "PGRST204"
            ? "Rode a migração 0022_twitch.sql no Supabase."
            : "Não foi possível salvar.",
    };
  }
  await audit({
    action: "profile.twitch_link",
    outcome: "success",
    actorId: auth.session.id,
    detail: { userId: auth.userId, twitch: login },
  });
  refresh();
  return { ok: true, message: login ? `Canal da Twitch salvo: ${login}.` : "Canal da Twitch removido.", login };
}
