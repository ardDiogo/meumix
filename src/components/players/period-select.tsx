"use client";

import { Filter } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import type { PeriodOption } from "@/lib/player-period";
import { cn } from "@/lib/utils";

/** Seletor do período do resumo do jogador (mantém os outros parâmetros, como "comparar"). */
export function PeriodSelect({ options, value }: { options: PeriodOption[]; value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const change = (next: string) => {
    const sp = new URLSearchParams(params.toString());
    if (next === "geral") sp.delete("periodo");
    else sp.set("periodo", next);
    const q = sp.toString();
    start(() => router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false }));
  };
  return (
    <label className={cn("flex items-center gap-2 text-sm", pending && "opacity-60")}>
      <Filter className="size-4 text-win" aria-hidden />
      <span className="sr-only">Período</span>
      <select
        value={value}
        onChange={(e) => change(e.target.value)}
        className="h-9 rounded-md border border-border bg-surface-2 px-3 pr-8 text-sm hover:border-border-strong focus:border-brand focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
