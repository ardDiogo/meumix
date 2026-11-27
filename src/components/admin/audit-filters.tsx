"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { AUDIT_CATEGORIES } from "@/lib/audit-labels";
import { Input, Select } from "../ui/input";

/** Filtros dos logs: mudam a URL na hora (sem botão "Filtrar"). */
export function AuditFilters({ players }: { players: { id: string; name: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    next.set("aba", "logs");
    next.delete("pagina");
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    router.push(`${pathname}?${next}`, { scroll: false });
  };
  const select = (key: string, label: string, options: [string, string][]) => (
    <Select
      aria-label={label}
      className="h-9 w-auto min-w-0 flex-1 text-sm sm:flex-none"
      value={params.get(key) ?? ""}
      onChange={(e) => set({ [key]: e.target.value || null })}
    >
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </Select>
  );
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
      <form
        role="search"
        className="relative w-full sm:w-56"
        onSubmit={(e) => {
          e.preventDefault();
          set({ q: q.trim() || null });
        }}
      >
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
        <Input
          aria-label="Buscar nos logs"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onBlur={() => (q.trim() || null) !== params.get("q") && set({ q: q.trim() || null })}
          placeholder="Buscar jogador ou ação…"
          className="h-9 pl-9"
        />
      </form>
      {select("periodo", "Período", [
        ["", "Qualquer data"],
        ["hoje", "Hoje"],
        ["7d", "Últimos 7 dias"],
        ["30d", "Últimos 30 dias"],
      ])}
      {select("categoria", "Categoria", [
        ["", "Todas as categorias"],
        ...(Object.entries(AUDIT_CATEGORIES) as [string, string][]),
      ])}
      {select("resultado", "Resultado", [
        ["", "Todos os resultados"],
        ["recusado", "Só recusados / erros"],
        ["sucesso", "Só sucesso"],
      ])}
      {select("jogador", "Jogador", [
        ["", "Todos os jogadores"],
        ...players.map((p) => [p.id, p.name] as [string, string]),
      ])}
    </div>
  );
}
