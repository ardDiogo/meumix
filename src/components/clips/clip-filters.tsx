"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select } from "../ui/input";

/** Filtros dos clipes (tipo, jogador, mapa e "meus"); mudam a URL. */
export function ClipFilters({
  kinds,
  players,
  maps,
  canMine,
}: {
  kinds: { value: string; label: string }[];
  players: { value: string; label: string }[];
  maps: { value: string; label: string }[];
  canMine: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("mais");
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  const select = (key: string, all: string, options: { value: string; label: string }[]) => (
    <Select
      aria-label={all}
      className="h-9 min-w-0 flex-1 text-sm sm:w-auto sm:flex-none"
      value={params.get(key) ?? ""}
      onChange={(e) => set(key, e.target.value || null)}
    >
      <option value="">{all}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </Select>
  );
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {select("tipo", "Tipo: todos", kinds)}
      {select("jogador", "Jogador: todos", players)}
      {select("mapa", "Mapa: todos", maps)}
      {canMine && (
        <label className="flex h-9 cursor-pointer items-center gap-2 rounded-md border border-border bg-surface-2 px-3 text-sm">
          <input
            type="checkbox"
            className="accent-brand"
            checked={params.get("meus") === "1"}
            onChange={(e) => set("meus", e.target.checked ? "1" : null)}
          />
          Meus clipes
        </label>
      )}
    </div>
  );
}
