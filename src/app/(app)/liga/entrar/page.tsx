import { LogIn, Trophy } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { JoinLeagueForm } from "@/components/leagues/join-league-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getSession } from "@/services/auth";
import { visibleLeagues } from "@/services/league";

export const metadata: Metadata = { title: "Entrar numa liga" };

/** Convite de liga: /liga/entrar?codigo=K7QX2M (logado, entra sozinho). */
export default async function JoinLeaguePage({ searchParams }: PageProps<"/liga/entrar">) {
  const { codigo } = await searchParams;
  const code = typeof codigo === "string" ? codigo.slice(0, 12) : "";
  const session = await getSession();
  const mine = session ? await visibleLeagues() : [];
  const next = `/liga/entrar${code ? `?codigo=${encodeURIComponent(code)}` : ""}`;

  return (
    <>
      <PageHeader
        title="Entrar numa liga"
        description="Cada liga tem seus mixes, ranking e ELO. Você só vê as ligas em que está."
      />
      <Card className="max-w-xl">
        <CardContent className="space-y-4 py-5">
          {session ? (
            <>
              <p className="text-sm text-muted">
                Digite o código que o admin da liga mandou{code ? " (ou confirme o do link)" : ""}.
              </p>
              <JoinLeagueForm initial={code} auto={!!code} />
              {mine.length > 0 && (
                <p className="flex flex-wrap items-center gap-1.5 text-xs text-subtle">
                  <Trophy className="size-3.5" /> Você já está em: {mine.map((l) => l.name).join(" · ")}
                </p>
              )}
            </>
          ) : (
            <>
              <p className="text-sm text-muted">Entre na sua conta (ou crie uma) para usar o convite.</p>
              <Button variant="primary" asChild>
                <Link href={`/entrar?next=${encodeURIComponent(next)}`}>
                  <LogIn /> Entrar e usar o convite
                </Link>
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}
