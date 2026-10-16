import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { FormMessage } from "@/components/auth/form-parts";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { getSession } from "@/services/auth";

export const metadata: Metadata = { title: "Redefinir senha" };

export default async function ResetPasswordPage() {
  const session = await getSession();
  return (
    <AuthShell>
      <div className="mb-6 text-center">
        <h1 className="font-display text-2xl font-bold tracking-tight">Nova senha</h1>
        <p className="mt-1 text-sm text-muted">Defina uma nova senha para sua conta.</p>
      </div>
      {session ? (
        <ResetPasswordForm />
      ) : (
        <div className="space-y-4">
          <FormMessage tone="error">O link de redefinição é inválido ou expirou.</FormMessage>
          <Link href="/entrar" className="block text-center text-sm font-medium text-brand hover:underline">
            Voltar para o login
          </Link>
        </div>
      )}
    </AuthShell>
  );
}
