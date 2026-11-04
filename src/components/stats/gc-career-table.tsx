"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { useMemo, useState } from "react";
import { GC_TABS, gcCol, HS, RATING, SWING, type GcCol } from "@/components/mixes/match-stats-table";
import { PlayerLink } from "@/components/players/player-link";
import type { GcLine } from "@/lib/gc-analysis";
import { cn } from "@/lib/utils";
import type { Player } from "@/types/domain";

const fmt = (n: number | null, digits = 0) =>
  n == null ? "-" : n.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** Aba Geral da carreira: rating, swing e o básico somado de todos os mapas da GC. */
const GERAL: GcCol[] = [
  RATING,
  SWING,
  gcCol("k", "K", (g) => g.k),
  gcCol("a", "A", (g) => g.a),
  gcCol("d", "D", (g) => g.d),
  gcCol(
    "kdr",
    "KDR",
    (g) => (g.d ? g.k / g.d : g.k),
    (g) => <span className="font-semibold">{fmt(g.d ? g.k / g.d : g.k, 2)}</span>,
  ),
  gcCol(
    "adr",
    "ADR",
    (g) => g.adr,
    (g) => fmt(g.adr, 1),
  ),
  gcCol(
    "kast",
    "KAST",
    (g) => g.kast,
    (g) => (g.kast == null ? "-" : `${fmt(g.kast)}%`),
  ),
  HS,
];

const TABS = [{ key: "geral", label: "Geral", sort: "rating", cols: GERAL }, ...GC_TABS];

/** Mapas e rounds aparecem em todas as abas: mostram o tamanho da amostra. */
const SAMPLE: GcCol[] = [
  gcCol(
    "maps",
    "Mapas",
    (g) => g.maps,
    (g) => <span className="text-muted">{g.maps}</span>,
  ),
  gcCol(
    "rounds",
    "Rounds",
    (g) => g.rounds,
    (g) => <span className="text-muted">{g.rounds}</span>,
  ),
];

/**
 * Dados da GC de todos os mixes, por jogador, com as mesmas abas da tabela
 * do mix (Geral, Entries, Trades, Clutch, Utilitárias, Mira). Ordenável.
 */
export function GcCareerTable({ lines, players }: { lines: GcLine[]; players: Record<string, Player> }) {
  const [tab, setTab] = useState("geral");
  const spec = TABS.find((t) => t.key === tab)!;
  const cols = useMemo(() => [...SAMPLE, ...spec.cols], [spec]);
  const [sort, setSort] = useState<{ key: string; desc: boolean }>({ key: "rating", desc: true });

  const rows = useMemo(() => {
    const list = lines.filter((l) => l.userId && players[l.userId]).map((gc) => ({ gc }));
    const col = cols.find((c) => c.key === sort.key) ?? cols[0]!;
    return list.sort((x, y) => {
      const a = col.value(x);
      const b = col.value(y);
      if (a == null || b == null) return (a == null ? 1 : 0) - (b == null ? 1 : 0);
      // Empate: quem jogou mais rounds primeiro.
      return (sort.desc ? b - a : a - b) || y.gc.rounds - x.gc.rounds;
    });
  }, [lines, players, cols, sort]);

  return (
    <div>
      <div className="border-b border-border px-4 py-3">
        <div
          role="tablist"
          aria-label="Estatística"
          className="inline-flex max-w-full overflow-x-auto rounded-md border border-border bg-surface p-0.5"
        >
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={t.key === tab}
              onClick={() => {
                setTab(t.key);
                setSort({ key: t.sort, desc: true });
              }}
              className={cn(
                "flex h-8 items-center rounded-[5px] px-3 text-sm font-medium whitespace-nowrap transition-colors",
                t.key === tab ? "bg-surface-3 text-fg" : "text-muted hover:text-fg",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-border text-xs font-semibold text-muted">
              <th className="w-8 px-4 py-3 text-left">#</th>
              <th className="px-2 py-3 text-left">Jogador</th>
              {cols.map((c) => {
                const active = sort.key === c.key;
                return (
                  <th key={c.key} className="px-2 py-3 text-center" title={c.title}>
                    <button
                      type="button"
                      onClick={() => setSort({ key: c.key, desc: sort.key === c.key ? !sort.desc : true })}
                      className={cn("inline-flex items-center gap-0.5 hover:text-fg", active && "text-fg")}
                    >
                      {c.label}
                      {active &&
                        (sort.desc ? <ArrowDown className="size-3" aria-hidden /> : <ArrowUp className="size-3" />)}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.gc.key} className="border-b border-border last:border-0 hover:bg-surface-2/50">
                <td className={cn("px-4 py-2.5 font-display", i === 0 ? "font-bold text-brand" : "text-subtle")}>
                  {i + 1}
                </td>
                <td className="px-2 py-2.5">
                  <PlayerLink player={players[r.gc.userId!]!} size="sm" className="max-w-44" />
                </td>
                {cols.map((c) => (
                  <td key={c.key} className="px-2 py-2.5 text-center tabular">
                    {c.render ? c.render(r) : c.value(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-border px-4 py-3 text-xs text-subtle">
        Soma de todos os mapas importados da Gamers Club. Contagens são somadas; rating, swing, ADR, KAST e mira são
        médias pelos rounds. Arma principal: a que mais aparece entre os mapas.
      </p>
    </div>
  );
}
