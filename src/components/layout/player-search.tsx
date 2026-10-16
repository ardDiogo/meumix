import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

/** Busca de jogadores — envia para /jogadores?q=... (funciona sem JavaScript). */
export function PlayerSearch({ className, defaultValue }: { className?: string; defaultValue?: string }) {
  return (
    <form action="/jogadores" role="search" className={cn("relative", className)}>
      <label htmlFor="player-search" className="sr-only">
        Buscar jogadores
      </label>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" aria-hidden />
      <input
        id="player-search"
        name="q"
        type="search"
        defaultValue={defaultValue}
        placeholder="Buscar jogador…"
        autoComplete="off"
        className="h-9 w-full rounded-md border border-border bg-surface-2 pr-3 pl-9 text-sm text-fg transition-colors placeholder:text-subtle hover:border-border-strong focus:border-brand focus:outline-none"
      />
    </form>
  );
}
