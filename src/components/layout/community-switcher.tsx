"use client";

import { Check, ChevronDown, KeyRound, Loader2, Trophy } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { setLeague } from "@/app/(app)/liga/actions";
import type { League } from "@/lib/league";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

/**
 * Liga atual (Mix da Lanterna, Mix do Jantinha…). Com mais de uma liga visível, vira
 * um seletor: mixes, ranking, estatísticas e perfis passam a mostrar só a escolhida.
 */
export function LeagueSwitcher({
  leagues,
  current,
  className,
  block = false,
}: {
  leagues: League[];
  current: League | null;
  className?: string;
  /** Versão do menu do celular (largura toda, com rótulo). */
  block?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (!current) return null;
  if (current.none) {
    return (
      <Link
        href="/liga/entrar"
        className={cn(
          "flex items-center gap-2 rounded-md border border-dashed border-border-strong text-sm font-medium text-muted transition-colors hover:text-fg",
          block ? "w-full px-3 py-2" : "h-9 px-2.5",
          className,
        )}
      >
        <KeyRound className="size-4 shrink-0 text-brand" /> Entrar numa liga
      </Link>
    );
  }

  // No topo, o nome curto ("Lanterna"); o inteiro no menu do celular e no título.
  const short = current.name.replace(/^Mix d[aeo] /i, "");
  const label = (
    <span className="min-w-0 text-left">
      {block && <span className="block text-[10px] font-semibold tracking-wider text-subtle uppercase">Liga</span>}
      {block ? (
        <span className="block truncate text-sm font-medium text-fg">{current.name}</span>
      ) : (
        <span className="block truncate text-sm font-medium text-fg" title={current.name}>
          {short}
        </span>
      )}
    </span>
  );
  const box = cn(
    "flex items-center gap-2 rounded-md border border-border bg-surface-2/60",
    block ? "w-full px-3 py-2" : "h-9 px-2.5",
    className,
  );

  if (leagues.length < 2) {
    return (
      <div className={box}>
        <Trophy className="size-4 shrink-0 text-brand" />
        {label}
      </div>
    );
  }

  const choose = (slug: string) => {
    if (slug === current.slug) return;
    start(async () => {
      const r = await setLeague(slug);
      if (!r.ok) toast.error(r.message);
      router.refresh();
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(box, "transition-colors hover:bg-surface-2 data-[state=open]:bg-surface-2")}
        aria-label={`Liga: ${current.name}. Trocar de liga`}
      >
        {pending ? (
          <Loader2 className="size-4 shrink-0 animate-spin text-brand" />
        ) : (
          <Trophy className="size-4 shrink-0 text-brand" />
        )}
        {label}
        <ChevronDown className="ml-auto size-4 shrink-0 text-subtle" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-52">
        <DropdownMenuLabel>Trocar de liga</DropdownMenuLabel>
        {leagues.map((l) => (
          <DropdownMenuItem key={l.id} onSelect={() => choose(l.slug)}>
            <Check className={cn("size-4", l.id === current.id ? "text-brand" : "invisible")} />
            {l.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
