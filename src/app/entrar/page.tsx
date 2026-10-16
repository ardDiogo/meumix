import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { AuthShell } from "@/components/auth/auth-shell";
import { FormMessage } from "@/components/auth/form-parts";
import { safeNextPath } from "@/lib/auth/validation";
import { isAuthConfigured } from "@/lib/supabase/config";
import { getSession } from "@/services/auth";

export const metadata: Metadata = { title: "Entrar" };

export default async function SignInPage({ searchParams }: PageProps<"/entrar">) {
  const { next, erro, modo } = await searchParams;
  if (await getSession()) redirect(safeNextPath(next));

  return (
    <AuthShell>
      {erro === "link" && (
        <div className="mb-4">
          <FormMessage tone="error">O link é inválido ou expirou. Tente novamente.</FormMessage>
        </div>
      )}
      <AuthCard
        next={safeNextPath(next)}
        configured={isAuthConfigured()}
        initialMode={modo === "cadastro" ? "cadastro" : "login"}
      />
    </AuthShell>
  );
}
