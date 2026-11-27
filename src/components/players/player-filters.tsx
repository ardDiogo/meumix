"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PLAYER_SORTS, type PlayerSort } from "@/lib/player-sorts";
import { Select } from "../ui/input";

/** Ordenar e filtrar por nível (mantém a busca na URL). */
export function PlayerFilters({ sort, level }: { sort: PlayerSort; level: number | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  return (
    <div className="flex w-full gap-2 sm:w-auto">
      <label className="sr-only" htmlFor="player-sort">
        Ordenar por
      </label>
      <Select
        id="player-sort"
        className="h-9 min-w-0 flex-1 text-sm sm:w-auto sm:flex-none"
        value={sort}
        onChange={(e) => set("ordem", e.target.value === "elo" ? null : e.target.value)}
      >
        {Object.entries(PLAYER_SORTS).map(([value, label]) => (
          <option key={value} value={value}>
            Ordenar: {label}
          </option>
        ))}
      </Select>
      <label className="sr-only" htmlFor="player-level">
        Nível
      </label>
      <Select
        id="player-level"
        className="h-9 min-w-0 flex-1 text-sm sm:w-auto sm:flex-none"
        value={level ?? ""}
        onChange={(e) => set("nivel", e.target.value || null)}
      >
        <option value="">Todos os níveis</option>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <option key={n} value={n}>
            Nível {n}
          </option>
        ))}
      </Select>
    </div>
  );
}
