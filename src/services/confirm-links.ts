import "server-only";
import { randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Link pessoal de confirmação (sem login): /c/<código> grava o código num
 * cookie e o link do grupo (/confirmar) passa a reconhecer o celular.
 * Gerar um código novo invalida o antigo, inclusive nos celulares lembrados.
 */
export const CONFIRM_COOKIE = "mm_confirm";
export const CONFIRM_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
const TOKEN = /^[A-Za-z0-9_-]{20,64}$/;

export const isConfirmToken = (value: unknown): value is string => typeof value === "string" && TOKEN.test(value);

const newToken = () => randomBytes(18).toString("base64url");

export interface ConfirmLinkUser {
  id: string;
  displayName: string;
}

export async function userForConfirmToken(token: string): Promise<ConfirmLinkUser | null> {
  if (!isConfirmToken(token)) return null;
  const admin = createSupabaseAdminClient();
  if (!admin) return null;
  const { data } = await admin.from("confirm_links").select("user_id").eq("token", token).maybeSingle();
  if (!data) return null;
  const { data: profile } = await admin
    .from("profiles")
    .select("display_name")
    .eq("id", data.user_id as string)
    .maybeSingle();
  return { id: data.user_id as string, displayName: (profile?.display_name as string | undefined) ?? "Jogador" };
}

/** Jogador lembrado neste navegador pelo link pessoal, se houver. */
export async function confirmLinkUser(): Promise<ConfirmLinkUser | null> {
  const token = (await cookies()).get(CONFIRM_COOKIE)?.value;
  return token ? userForConfirmToken(token) : null;
}

/** Código atual do jogador; cria um se ainda não existir. */
export async function getOrCreateConfirmToken(userId: string, rotate = false): Promise<string | null> {
  const admin = createSupabaseAdminClient();
  if (!admin) return null;
  if (!rotate) {
    const { data, error } = await admin.from("confirm_links").select("token").eq("user_id", userId).maybeSingle();
    if (error) return null;
    if (data) return data.token as string;
  }
  const token = newToken();
  const { error } = await admin
    .from("confirm_links")
    .upsert({ user_id: userId, token, created_at: new Date().toISOString() }, { onConflict: "user_id" });
  return error ? null : token;
}

export async function confirmLinkUrl(token: string) {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${host ? `${proto}://${host}` : "https://meumix.vercel.app"}/c/${token}`;
}
