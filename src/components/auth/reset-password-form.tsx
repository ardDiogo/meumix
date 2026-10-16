"use client";

import { Loader2 } from "lucide-react";
import { useActionState } from "react";
import { updatePassword, type AuthState } from "@/app/entrar/actions";
import { PASSWORD_MIN } from "@/lib/auth/validation";
import { Button } from "../ui/button";
import { AuthField, FormMessage } from "./form-parts";

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(updatePassword, { status: "idle" });
  const errors = state.status === "error" ? (state.fields ?? {}) : {};
  return (
    <form action={action} className="space-y-4" noValidate>
      {state.status === "error" && state.message && <FormMessage tone="error">{state.message}</FormMessage>}
      <AuthField
        id="password"
        label="Nova senha"
        type="password"
        autoComplete="new-password"
        placeholder={`Mínimo de ${PASSWORD_MIN} caracteres`}
        error={errors.password}
        required
      />
      <AuthField
        id="confirm"
        label="Confirmar nova senha"
        type="password"
        autoComplete="new-password"
        placeholder="Repita a senha"
        error={errors.confirm}
        required
      />
      <Button type="submit" variant="primary" size="lg" className="w-full" disabled={pending}>
        {pending && <Loader2 className="animate-spin" />}
        {pending ? "Salvando…" : "Salvar nova senha"}
      </Button>
    </form>
  );
}
