export const PASSWORD_MIN = 8;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type FieldErrors = Partial<Record<"email" | "password" | "confirm" | "displayName" | "gcLevel", string>>;

export function validateEmail(email: string) {
  return EMAIL.test(email) ? undefined : "Informe um e-mail válido.";
}

export function validatePassword(password: string) {
  return password.length >= PASSWORD_MIN ? undefined : `A senha deve ter pelo menos ${PASSWORD_MIN} caracteres.`;
}

export function validateDisplayName(name: string) {
  const n = name.trim();
  if (n.length < 2) return "Informe um nickname com pelo menos 2 caracteres.";
  if (n.length > 24) return "O nickname pode ter no máximo 24 caracteres.";
  return undefined;
}

/** Aceita apenas caminhos internos (evita redirecionamento aberto). */
export function safeNextPath(next: unknown, fallback = "/dashboard") {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")
    ? next
    : fallback;
}

/** Traduz erros do Supabase Auth para mensagens ao usuário. */
export function authErrorMessage(code: string | undefined, fallback = "Não foi possível concluir. Tente novamente.") {
  switch (code) {
    case "invalid_credentials":
      return "E-mail ou senha incorretos.";
    case "email_not_confirmed":
      return "Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.";
    case "user_already_exists":
    case "email_exists":
      return "Já existe uma conta com este e-mail.";
    case "weak_password":
      return "Senha muito fraca. Use letras, números e pelo menos 8 caracteres.";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "Muitas tentativas. Aguarde alguns minutos e tente novamente.";
    case "same_password":
      return "A nova senha deve ser diferente da anterior.";
    case "signup_disabled":
      return "Novos cadastros estão desativados no momento.";
    default:
      return fallback;
  }
}
