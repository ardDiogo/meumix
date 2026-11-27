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
  /** Some no celular (fica o essencial). */
  wide?: boolean;
  /** Número que depende do tamanho da amostra (apagado com poucos mixes). */
  sample?: boolean;
}

/** Menos que isso no período: win rate, K/D, ADR e KAST ficam apagados. */
const MIN_MIXES = 3;
const decided = (r: RankingRow) => r.stats.wins + r.stats.losses;

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
  { key: "e", label: "E", title: "Empates", value: (r) => r.stats.draws, className: "text-draw" },
  { key: "d", label: "D", title: "Derrotas", value: (r) => r.stats.losses, className: "text-loss" },
  {
    key: "wr",
    label: "Win rate",
    title: "Vitórias sobre os mixes do período (só empates: —)",
    // Só empates: sem win rate (não é 0%).
    value: (r) => (decided(r) ? r.stats.winRate : null),
    render: (r) => (decided(r) ? <WinRate value={r.stats.winRate} /> : <span className="text-subtle">—</span>),
    sample: true,
  },
  {
    key: "kd",
    label: "K/D",
    value: (r) => r.stats.kd,
    render: (r) => <span className={r.stats.kd >= 1 ? "text-win" : "text-loss"}>{formatDecimal(r.stats.kd)}</span>,
    sample: true,
  },
  {
    key: "kad",
    label: "K/A/D",
    title: "Kills / assistências / mortes (ordena por kills)",
    value: (r) => r.stats.kills,
    render: (r) => (
      <span className="text-muted">
        <b className="font-semibold text-fg">{r.stats.kills}</b>/{r.stats.assists}/{r.stats.deaths}
      </span>
    ),
  },
  {
    key: "adr",
    label: "ADR",
    value: (r) => r.stats.adr,
    render: (r) => formatDecimal(r.stats.adr, 1),
    wide: true,
    sample: true,
  },
  {
    key: "kast",
    label: "KAST",
    value: (r) => r.stats.kast,
    render: (r) => (r.stats.kast == null ? "-" : formatPercent(r.stats.kast)),
    wide: true,
    sample: true,
  },
  { key: "fk", label: "FK", title: "First kills", value: (r) => r.stats.firstKills, wide: true },
  { key: "mvp", label: "MVP", title: "Vezes MVP do mix", value: (r) => r.stats.mvps },
  { key: "lant", label: "Lant.", title: "Vezes lanterna do mix", value: (r) => r.stats.lanterns, wide: true },
];

/**
 * Tabela do ranking. Clique no título de uma coluna para ordenar (de novo
 * inverte). A posição (#) é a do ranking por ELO e não muda com a ordenação.
 */
export function RankingTable({ rows, viewerId }: { rows: RankingRow[]; viewerId?: string | null }) {
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
    // No celular: a tabela rola dentro dela, com o cabeçalho e as colunas # e Jogador fixos.
    <Table wrapperClassName="max-h-[75vh] overflow-y-auto md:max-h-none md:overflow-y-visible">
      <THead className="sticky top-0 z-20 bg-surface-2 md:static">
        <TR>
          <TH className="sticky left-0 z-10 w-14 max-w-14 min-w-14 bg-surface-2 px-1 text-center md:static">
            <SortButton
              active={sort.key === "elo"}
              desc={sort.desc}
              onClick={() => toggle("elo")}
              title="Posição no ranking (ELO)"
            >
              #
            </SortButton>
          </TH>
          <TH className="sticky left-14 z-10 min-w-36 bg-surface-2 md:static md:min-w-44">Jogador</TH>
          {COLS.map((c) => (
            <TH key={c.key} className={cn("text-right whitespace-nowrap", c.wide && "hidden md:table-cell")}>
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
        {sorted.map((r) => {
          const me = !!viewerId && r.player.id === viewerId;
          const few = r.stats.mixes < MIN_MIXES;
          // Fundo sólido nas colunas fixas (senão o resto da linha aparece por baixo ao rolar).
          const stickyBg = me ? "bg-[color-mix(in_oklab,var(--color-brand)_8%,var(--color-surface))]" : "bg-surface";
          return (
            <TR key={r.player.id} className={cn("hover:bg-surface-2/50", me && "bg-brand/8 hover:bg-brand/12")}>
              <TD
                className={cn(
                  "sticky left-0 z-10 w-14 max-w-14 min-w-14 px-1 text-center md:static md:bg-transparent",
                  stickyBg,
                )}
              >
                <div className="flex flex-col items-center gap-0.5">
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
                  <PositionChange value={r.positionChange} />
                </div>
              </TD>
              <TD className={cn("sticky left-14 z-10 md:static md:bg-transparent", stickyBg)}>
                <Link href={playerHref(r.player)} className="group flex items-center gap-2.5">
                  <Avatar name={r.player.nickname} src={r.player.avatarUrl} size="sm" />
                  <span className="max-w-28 truncate font-medium whitespace-nowrap group-hover:text-brand md:max-w-none">
                    {r.player.nickname}
                  </span>
                  {me && (
                    <span className="shrink-0 rounded bg-brand/15 px-1 text-[10px] font-bold text-brand uppercase">
                      você
                    </span>
                  )}
                </Link>
              </TD>
              {COLS.map((c) => (
                <TD
                  key={c.key}
                  title={c.sample && few ? `Poucos mixes no período (${r.stats.mixes})` : undefined}
                  className={cn(
                    "text-right tabular",
                    c.className,
                    c.wide && "hidden md:table-cell",
                    c.sample && few && "opacity-45",
                    sort.key === c.key && "bg-brand/5",
                  )}
                >
                  {c.render ? c.render(r) : (c.value(r) ?? "-")}
                </TD>
              ))}
            </TR>
          );
        })}
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

/** ▲2 / ▼1 ao lado da posição (variação no período). */
function PositionChange({ value }: { value?: number | null }) {
  if (!value) return null;
  return (
    <span
      title={`${value > 0 ? "Subiu" : "Caiu"} ${Math.abs(value)} ${Math.abs(value) === 1 ? "posição" : "posições"} no período`}
      className={cn("text-[10px] leading-none font-bold tabular", value > 0 ? "text-win" : "text-loss")}
    >
      {value > 0 ? "▲" : "▼"}
      {Math.abs(value)}
    </span>
  );
}

function WinRate({ value }: { value: number }) {
  return (
    <div className="ml-auto flex w-24 items-center justify-end gap-2">
      <div className="hidden h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3 sm:block" aria-hidden>
        <div
          className={cn("h-full rounded-full", value > 50 ? "bg-win" : value < 50 ? "bg-loss" : "bg-yellow-400")}
          style={{ width: `${Math.max(4, Math.min(100, value))}%` }}
        />
      </div>
      <span className={cn("w-10", value >= 50 ? "text-win" : "text-loss")}>{formatPercent(value)}</span>
    </div>
  );
}
