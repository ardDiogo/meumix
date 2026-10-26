"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { formatDecimal, formatPercent } from "@/lib/format";
import { playerHref } from "@/lib/player-slug";
import { cn } from "@/lib/utils";
import type { RankingRow } from "@/types/views";
import { LevelBadge } from "../players/level-badge";
import { Delta } from "../stats/delta";
import { Avatar } from "../ui/avatar";
import { Table, TD, TH, THead, TR } from "../ui/table";

interface Col {
  key: string;
  label: string;
  title?: string;
  value: (r: RankingRow) => number | null;
  render?: (r: RankingRow) => React.ReactNode;
  className?: string;
}

const COLS: Col[] = [
  {
    key: "elo",
    label: "ELO",
    value: (r) => r.elo,
    render: (r) => (
      <div className="flex items-center justify-end gap-2">
        <LevelBadge elo={r.elo} />
        <span className="font-display text-base font-bold">{r.elo}</span>
      </div>
    ),
  },
  {
    key: "var",
    label: "Var.",
    title: "Variação de ELO no período",
    value: (r) => r.eloChange,
    render: (r) => <Delta value={r.eloChange} />,
  },
  { key: "mixes", label: "Mixes", value: (r) => r.stats.mixes, className: "text-muted" },
  { key: "v", label: "V", title: "Vitórias", value: (r) => r.stats.wins, className: "text-win" },
  { key: "d", label: "D", title: "Derrotas", value: (r) => r.stats.losses, className: "text-loss" },
  {
    key: "wr",
    label: "Win rate",
    value: (r) => r.stats.winRate,
    render: (r) => <WinRate value={r.stats.winRate} />,
  },
  {
    key: "kd",
    label: "K/D",
    value: (r) => r.stats.kd,
    render: (r) => <span className={r.stats.kd >= 1 ? "text-win" : "text-loss"}>{formatDecimal(r.stats.kd)}</span>,
  },
  { key: "adr", label: "ADR", value: (r) => r.stats.adr, render: (r) => formatDecimal(r.stats.adr, 1) },
  {
    key: "kast",
    label: "KAST",
    value: (r) => r.stats.kast,
    render: (r) => (r.stats.kast == null ? "-" : formatPercent(r.stats.kast)),
  },
  { key: "k", label: "K", title: "Kills", value: (r) => r.stats.kills },
  { key: "dt", label: "Mortes", value: (r) => r.stats.deaths },
  { key: "a", label: "A", title: "Assistências", value: (r) => r.stats.assists },
  { key: "fk", label: "FK", title: "First kills", value: (r) => r.stats.firstKills },
  { key: "mvp", label: "MVP", title: "Vezes MVP do mix", value: (r) => r.stats.mvps },
  { key: "lant", label: "Lant.", title: "Vezes lanterna do mix", value: (r) => r.stats.lanterns },
];

/**
 * Tabela do ranking. Clique no título de uma coluna para ordenar (de novo
 * inverte). A posição (#) é a do ranking por ELO e não muda com a ordenação.
 */
export function RankingTable({ rows }: { rows: RankingRow[] }) {
  const [sort, setSort] = useState<{ key: string; desc: boolean }>({ key: "elo", desc: true });
  const sorted = useMemo(() => {
    const col = COLS.find((c) => c.key === sort.key) ?? COLS[0]!;
    return [...rows].sort((x, y) => {
      const a = col.value(x) ?? -Infinity;
      const b = col.value(y) ?? -Infinity;
      // Empate: mantém a ordem do ranking por ELO.
      return (sort.desc ? b - a : a - b) || x.position - y.position;
    });
  }, [rows, sort]);

  const toggle = (key: string) => setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: true }));

  return (
    <Table>
      <THead>
        <TR>
          <TH className="w-14 text-center">
            <SortButton
              active={sort.key === "elo"}
              desc={sort.desc}
              onClick={() => toggle("elo")}
              title="Posição no ranking (ELO)"
            >
              #
            </SortButton>
          </TH>
          <TH className="min-w-44">Jogador</TH>
          {COLS.map((c) => (
            <TH key={c.key} className="text-right whitespace-nowrap">
              <SortButton
                active={sort.key === c.key}
                desc={sort.desc}
                onClick={() => toggle(c.key)}
                title={c.title ? `Ordenar por ${c.title.toLowerCase()}` : `Ordenar por ${c.label}`}
                align="end"
              >
                {c.label}
              </SortButton>
            </TH>
          ))}
        </TR>
      </THead>
      <tbody>
        {sorted.map((r) => (
          <TR key={r.player.id} className="hover:bg-surface-2/50">
            <TD className="text-center">
              <span
                className={cn(
                  "inline-flex size-7 items-center justify-center rounded-sm font-display text-sm font-bold tabular",
                  r.position === 1 && "bg-brand text-brand-fg",
                  r.position === 2 && "bg-brand/25 text-brand",
                  r.position === 3 && "bg-brand/12 text-brand",
                  r.position > 3 && "text-muted",
                )}
              >
                {r.position}
              </span>
            </TD>
            <TD>
              <Link href={playerHref(r.player)} className="group flex items-center gap-2.5">
                <Avatar name={r.player.nickname} src={r.player.avatarUrl} size="sm" />
                <span className="font-medium whitespace-nowrap group-hover:text-brand">{r.player.nickname}</span>
              </Link>
            </TD>
            {COLS.map((c) => (
              <TD key={c.key} className={cn("text-right tabular", c.className, sort.key === c.key && "bg-brand/5")}>
                {c.render ? c.render(r) : (c.value(r) ?? "-")}
              </TD>
            ))}
          </TR>
        ))}
      </tbody>
    </Table>
  );
}

function SortButton({
  active,
  desc,
  onClick,
  title,
  align = "center",
  children,
}: {
  active: boolean;
  desc: boolean;
  onClick: () => void;
  title: string;
  align?: "center" | "end";
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "inline-flex w-full items-center gap-1 uppercase hover:text-fg",
        align === "end" ? "justify-end" : "justify-center",
        active && "text-brand",
      )}
    >
      {children}
      {active && (desc ? <ArrowDown className="size-3" aria-hidden /> : <ArrowUp className="size-3" aria-hidden />)}
    </button>
  );
}

function WinRate({ value }: { value: number }) {
  return (
    <div className="ml-auto flex w-24 items-center justify-end gap-2">
      <div className="hidden h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3 sm:block" aria-hidden>
        <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, value)}%` }} />
      </div>
      <span className={cn("w-10", value >= 50 ? "text-win" : "text-loss")}>{formatPercent(value)}</span>
    </div>
  );
}
