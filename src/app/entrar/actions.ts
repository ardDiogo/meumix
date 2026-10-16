"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  authErrorMessage,
  safeNextPath,
  validateDisplayName,
  validateEmail,
  validatePassword,
  type FieldErrors,
} from "@/lib/auth/validation";
import { REMEMBER_COOKIE } from "@/lib/supabase/cookies";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AuthState =
  | { status: "idle" }
  | { status: "error"; message?: string; fields?: FieldErrors; email?: string }
  | { status: "success"; message: string };

const NOT_CONFIGURED: AuthState = {
  status: "error",
  message: "O login ainda não está configurado. Tente novamente mais tarde.",
};

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "");

async function origin() {
  const h = await headers();
  return h.get("origin") ?? `https://${h.get("host")}`;
}

export async function signIn(_prev: AuthState, fd: FormData): Promise<AuthState> {
  const email = str(fd, "email").trim().toLowerCase();
  const password = str(fd, "password");
  const remember = fd.get("remember") === "on";

  const fields: FieldErrors = { email: validateEmail(email), password: password ? undefined : "Informe sua senha." };
  if (fields.email || fields.password) return { status: "error", fields, email };

  const supabase = await createSupabaseServerClient({ remember });
  if (!supabase) return NOT_CONFIGURED;

  const cookieStore = await cookies();
  if (remember) cookieStore.delete(REMEMBER_COOKIE);
  else cookieStore.set(REMEMBER_COOKIE, "0", { httpOnly: true, sameSite: "lax", secure: true, path: "/" });

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { status: "error", message: authErrorMessage(error.code), email };

  redirect(safeNextPath(fd.get("next")));
}

export async function signUp(_prev: AuthState, fd: FormData): Promise<AuthState> {
  const displayName = str(fd, "displayName").trim();
  const email = str(fd, "email").trim().toLowerCase();
  const password = str(fd, "password");
  const confirm = str(fd, "confirm");

  const fields: FieldErrors = {
    displayName: validateDisplayName(displayName),
    email: validateEmail(email),
    password: validatePassword(password),
    confirm: password === confirm ? undefined : "As senhas não coincidem.",
  };
  if (Object.values(fields).some(Boolean)) return { status: "error", fields, email };

  const supabase = await createSupabaseServerClient();
  if (!supabase) return NOT_CONFIGURED;

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName },
      emailRedirectTo: `${await origin()}/auth/callback?next=/dashboard`,
    },
  });
  if (error) return { status: "error", message: authErrorMessage(error.code), email };

  // Com confirmação de e-mail desativada no Supabase, a sessão já vem pronta.
  if (data.session) redirect("/dashboard");
  return {
    status: "success",
    message: `Conta criada! Enviamos um link de confirmação para ${email}. Confirme o e-mail para entrar.`,
  };
}

export async function requestPasswordReset(_prev: AuthState, fd: FormData): Promise<AuthState> {
  const email = str(fd, "email").trim().toLowerCase();
  const emailError = validateEmail(email);
  if (emailError) return { status: "error", fields: { email: emailError }, email };

  const supabase = await createSupabaseServerClient();
  if (!supabase) return NOT_CONFIGURED;

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await origin()}/auth/callback?next=/redefinir-senha`,
  });
  if (error && error.code?.startsWith("over_"))
    return { status: "error", message: authErrorMessage(error.code), email };

  // Mesma resposta exista ou não a conta (não revela e-mails cadastrados).
  return {
    status: "success",
    message: "Se houver uma conta com este e-mail, você receberá um link para redefinir a senha.",
  };
}

export async function updatePassword(_prev: AuthState, fd: FormData): Promise<AuthState> {
  const password = str(fd, "password");
  const confirm = str(fd, "confirm");
  const fields: FieldErrors = {
    password: validatePassword(password),
    confirm: password === confirm ? undefined : "As senhas não coincidem.",
  };
  if (fields.password || fields.confirm) return { status: "error", fields };

  const supabase = await createSupabaseServerClient();
  if (!supabase) return NOT_CONFIGURED;

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return {
      status: "error",
      message:
        error.code === "session_not_found" || error.status === 401
          ? "O link expirou. Solicite uma nova redefinição de senha."
          : authErrorMessage(error.code),
    };
  }
  redirect("/dashboard");
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase?.auth.signOut();
  (await cookies()).delete(REMEMBER_COOKIE);
  redirect("/entrar");
}
