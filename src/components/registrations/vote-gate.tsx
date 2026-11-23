"use client";

import { Vote } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { PendingVote } from "@/services/vote-gate";
import { Button } from "../ui/button";

/** Páginas onde a própria janela de votação aparece (ou que precisam ficar livres). */
const FREE = ["/dashboard", "/confirmar", "/entrar", "/sair"];

/**
 * Classificado sem votar: cobre o site inteiro até votar (a votação fica no Dashboard,
 * que abre a janela de votação sozinha e não deixa fechar).
 */
export function VoteGate({ pending }: { pending: PendingVote | null }) {
  const path = usePathname();
  if (!pending || FREE.some((p) => path === p || path.startsWith(`${p}/`))) return null;
  const what = [pending.captains && "capitães", pending.maps && "mapas"].filter(Boolean).join(" e ");
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="vote-gate-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-bg/90 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-sm space-y-4 rounded-lg border border-brand/50 bg-surface p-6 text-center shadow-xl">
        <Vote className="mx-auto size-10 text-brand" aria-hidden />
        <div className="space-y-1">
          <h2 id="vote-gate-title" className="font-display text-xl font-bold">
            Hora de votar!
          </h2>
          <p className="text-sm text-muted">
            Você está no mix de <span className="font-semibold text-fg">{pending.when}</span>. Vote nos{" "}
            <span className="font-semibold text-fg">{what}</span> para continuar usando o site.
          </p>
        </div>
        <Button variant="primary" size="lg" className="w-full" asChild>
          <Link href="/dashboard">Votar agora</Link>
        </Button>
      </div>
    </div>
  );
}
