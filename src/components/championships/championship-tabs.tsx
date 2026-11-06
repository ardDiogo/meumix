"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/** Abas do campeonato (as próximas etapas acrescentam Equipes, Draft, Calendário…). */
export function ChampionshipTabs({ slug, canManage }: { slug: string; canManage: boolean }) {
  const path = usePathname();
  const base = `/campeonatos/${slug}`;
  const tabs = [
    { href: base, label: "Visão geral" },
    { href: `${base}/equipes`, label: "Equipes" },
    { href: `${base}/draft`, label: "Draft" },
    { href: `${base}/calendario`, label: "Calendário" },
    { href: `${base}/classificacao`, label: "Classificação" },
    { href: `${base}/playoffs`, label: "Playoffs" },
    { href: `${base}/estatisticas`, label: "Estatísticas" },
    { href: `${base}/premiacao`, label: "Premiação" },
    ...(canManage ? [{ href: `${base}/admin`, label: "Administração" }] : []),
  ];
  return (
    <nav aria-label="Seções do campeonato" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="flex min-w-max gap-1 border-b border-border">
        {tabs.map((t) => {
          const active = path === t.href;
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "-mb-px border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
                active ? "border-brand text-fg" : "border-transparent text-muted hover:text-fg",
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
