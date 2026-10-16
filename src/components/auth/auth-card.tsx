"use client";

import { ArrowLeft, Loader2 } from "lucide-react";
import { useActionState, useState } from "react";
import { requestPasswordReset, signIn, signUp, type AuthState } from "@/app/entrar/actions";
import { PASSWORD_MIN } from "@/lib/auth/validation";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
import { AuthField, FormMessage } from "./form-parts";

type Mode = "login" | "cadastro" | "recuperar";
const IDLE: AuthState = { status: "idle" };

export function AuthCard({
  next,
  configured,
  initialMode = "login",
}: {
  next: string;
  configured: boolean;
  initialMode?: Mode;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);

  return (
    <div className="w-full">
      <div className="mb-6 text-center">
        <h1 className="font-display text-2xl font-bold tracking-tight">
          {mode === "recuperar" ? "Recuperar senha" : "Bem-vindo"}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {mode === "recuperar"
            ? "Informe seu e-mail para receber o link de redefinição."
            : "Entre com sua conta ou crie uma nova."}
        </p>
      </div>

      {!configured && (
        <div className="mb-4">
          <FormMessage tone="info">
            O login ainda não está disponível nesta versão. Os formulários serão liberados assim que a autenticação for
            configurada.
          </FormMessage>
        </div>
      )}

      {mode !== "recuperar" && (
        <div
          role="tablist"
          aria-label="Acesso"
          className="mb-5 grid grid-cols-2 rounded-md border border-border bg-surface-2 p-1"
        >
          {(["login", "cadastro"] as const).map((m) => (
            <button
              key={m}
              role="tab"
              type="button"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={cn(
                "h-9 rounded-[5px] text-sm font-semibold transition-colors",
                mode === m ? "bg-bg text-fg shadow-sm" : "text-muted hover:text-fg",
              )}
            >
              {m === "login" ? "Login" : "Cadastro"}
            </button>
          ))}
        </div>
      )}

      {mode === "login" && <LoginForm next={next} disabled={!configured} onForgot={() => setMode("recuperar")} />}
      {mode === "cadastro" && <SignUpForm disabled={!configured} />}
      {mode === "recuperar" && <ResetForm disabled={!configured} onBack={() => setMode("login")} />}
    </div>
  );
}

function errorsOf(state: AuthState) {
  return state.status === "error" ? (state.fields ?? {}) : {};
}

function LoginForm({ next, disabled, onForgot }: { next: string; disabled: boolean; onForgot: () => void }) {
  const [state, action, pending] = useActionState(signIn, IDLE);
  const errors = errorsOf(state);
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next} />
      {state.status === "error" && state.message && <FormMessage tone="error">{state.message}</FormMessage>}
      <AuthField
        id="email"
        label="E-mail"
        type="email"
        autoComplete="email"
        placeholder="Digite seu e-mail"
        defaultValue={state.status === "error" ? state.email : undefined}
        error={errors.email}
        disabled={disabled}
        required
      />
      <AuthField
        id="password"
        label="Senha"
        type="password"
        autoComplete="current-password"
        placeholder="Digite sua senha"
        error={errors.password}
        disabled={disabled}
        required
      />
      <label className="flex w-fit cursor-pointer items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          name="remember"
          defaultChecked
          disabled={disabled}
          className="size-4 cursor-pointer rounded-sm border-border-strong accent-brand"
        />
        Lembrar de mim
      </label>
      <Button type="submit" variant="primary" size="lg" className="w-full" disabled={disabled || pending}>
        {pending && <Loader2 className="animate-spin" />}
        {pending ? "Entrando…" : "Entrar"}
      </Button>
      <button
        type="button"
        onClick={onForgot}
        className="mx-auto block text-sm font-medium text-muted transition-colors hover:text-brand"
      >
        Esqueci minha senha
      </button>
    </form>
  );
}

function SignUpForm({ disabled }: { disabled: boolean }) {
  const [state, action, pending] = useActionState(signUp, IDLE);
  const errors = errorsOf(state);
  if (state.status === "success") return <FormMessage tone="success">{state.message}</FormMessage>;
  return (
    <form action={action} className="space-y-4" noValidate>
      {state.status === "error" && state.message && <FormMessage tone="error">{state.message}</FormMessage>}
      <AuthField
        id="displayName"
        label="Nickname"
        autoComplete="nickname"
        placeholder="Como você é conhecido no CS"
        maxLength={24}
        error={errors.displayName}
        disabled={disabled}
        required
      />
      <AuthField
        id="email"
        label="E-mail"
        type="email"
        autoComplete="email"
        placeholder="Digite seu e-mail"
        defaultValue={state.status === "error" ? state.email : undefined}
        error={errors.email}
        disabled={disabled}
        required
      />
      <AuthField
        id="password"
        label="Senha"
        type="password"
        autoComplete="new-password"
        placeholder={`Mínimo de ${PASSWORD_MIN} caracteres`}
        error={errors.password}
        disabled={disabled}
        required
      />
      <AuthField
        id="confirm"
        label="Confirmar senha"
        type="password"
        autoComplete="new-password"
        placeholder="Repita a senha"
        error={errors.confirm}
        disabled={disabled}
        required
      />
      <Button type="submit" variant="primary" size="lg" className="w-full" disabled={disabled || pending}>
        {pending && <Loader2 className="animate-spin" />}
        {pending ? "Criando conta…" : "Criar conta"}
      </Button>
    </form>
  );
}

function ResetForm({ disabled, onBack }: { disabled: boolean; onBack: () => void }) {
  const [state, action, pending] = useActionState(requestPasswordReset, IDLE);
  const errors = errorsOf(state);
  return (
    <div className="space-y-4">
      {state.status === "success" ? (
        <FormMessage tone="success">{state.message}</FormMessage>
      ) : (
        <form action={action} className="space-y-4" noValidate>
          {state.status === "error" && state.message && <FormMessage tone="error">{state.message}</FormMessage>}
          <AuthField
            id="email"
            label="E-mail"
            type="email"
            autoComplete="email"
            placeholder="Digite seu e-mail"
            error={errors.email}
            disabled={disabled}
            required
          />
          <Button type="submit" variant="primary" size="lg" className="w-full" disabled={disabled || pending}>
            {pending && <Loader2 className="animate-spin" />}
            {pending ? "Enviando…" : "Enviar link"}
          </Button>
        </form>
      )}
      <button
        type="button"
        onClick={onBack}
        className="mx-auto flex items-center gap-1 text-sm font-medium text-muted transition-colors hover:text-brand"
      >
        <ArrowLeft className="size-4" /> Voltar para o login
      </button>
    </div>
  );
}
