"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { diffOf, kdrOf, type StatRow } from "@/lib/match-highlights";
import { cn } from "@/lib/utils";
import { LevelBadge } from "../players/level-badge";
import { Avatar } from "../ui/avatar";
import { TeamDot } from "./badges";
import { playerSlug } from "@/lib/player-slug";

type Col = {
  key: string;
  label: string;
  title?: string;
  value: (r: StatRow) => number | null;
  render?: (r: StatRow) => React.ReactNode;
};

const fmt = (n: number | null, digits = 0) =>
  n == null ? "-" : n.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
const tone = (n: number) => (n > 0 ? "text-win" : n < 0 ? "text-loss" : "text-muted");

const COLS: Col[] = [
  {
    key: "k",
    label: "K",
    title: "Kills",
    value: (r) => r.k,
    render: (r) => (
      <span className="inline-flex min-w-9 justify-center rounded-md border border-win/30 bg-win/10 px-1.5 py-0.5 text-win">
        {r.k}
      </span>
    ),
  },
  { key: "a", label: "A", title: "Assistências", value: (r) => r.a },
  {
    key: "d",
    label: "D",
    title: "Mortes",
    value: (r) => r.d,
    render: (r) => (
      <span className="inline-flex min-w-9 justify-center rounded-md border border-loss/30 bg-loss/10 px-1.5 py-0.5 text-loss">
        {r.d}
      </span>
    ),
  },
  {
    key: "diff",
    label: "DIFF",
    title: "Kills − mortes",
    value: diffOf,
    render: (r) => <span className={tone(diffOf(r))}>{signed(diffOf(r))}</span>,
  },
  { key: "adr", label: "ADR", title: "Dano médio por round", value: (r) => r.adr, render: (r) => fmt(r.adr, 2) },
  {
    key: "kdr",
    label: "KDR",
    title: "Kills por morte",
    value: kdrOf,
    render: (r) => <span className="font-semibold">{fmt(kdrOf(r), 2)}</span>,
  },
  { key: "kast", label: "KAST", value: (r) => r.kast, render: (r) => (r.kast == null ? "-" : `${fmt(r.kast)}%`) },
  { key: "s", label: "S", value: (r) => r.s, render: (r) => <span className="text-subtle">{r.s || "-"}</span> },
  { key: "fa", label: "FA", title: "Flash assists", value: (r) => r.fa },
  { key: "mk", label: "MK", title: "Multi-kills", value: (r) => r.mk },
  { key: "fk", label: "FK", title: "First kills", value: (r) => r.fk },
  {
    key: "rp",
    label: "RP",
    title: "Pontos de ranking (somados ao ELO)",
    value: (r) => r.rp,
    render: (r) => <span className={tone(r.rp)}>{signed(r.rp)}</span>,
  },
  { key: "drop", label: "DROP", value: (r) => r.drop },
];

/** Tabela "Estatísticas dos jogadores" do resultado do mix, ordenável por coluna. */
export function MatchStatsTable({ rows }: { rows: StatRow[] }) {
  const [sort, setSort] = useState<{ key: string; desc: boolean }>({ key: "k", desc: true });
  const sorted = useMemo(() => {
    const col = COLS.find((c) => c.key === sort.key) ?? COLS[0]!;
    return [...rows].sort((x, y) => {
      const a = col.value(x) ?? -Infinity;
      const b = col.value(y) ?? -Infinity;
      // Empate: mesma ordem da imagem compartilhada (mais kills, depois mais assistências).
      return (sort.desc ? b - a : a - b) || y.k - x.k || y.a - x.a;
    });
  }, [rows, sort]);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] text-sm">
        <thead>
          <tr className="border-b border-border text-xs font-semibold text-muted">
            <th className="px-4 py-3 text-left">Jogador</th>
            {COLS.map((c) => {
              const active = sort.key === c.key;
              return (
                <th key={c.key} className="px-2 py-3 text-center" title={c.title}>
                  <button
                    type="button"
                    onClick={() => setSort((s) => ({ key: c.key, desc: s.key === c.key ? !s.desc : true }))}
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
          {sorted.map((r) => (
            <tr key={r.key} className="border-b border-border last:border-0 hover:bg-surface-2/50">
              <td className="px-4 py-2.5">
                <div className="flex items-center gap-2 font-semibold">
                  <TeamDot side={r.team} />
                  <Avatar name={r.name} src={r.avatarUrl} size="sm" />
                  {r.userId ? (
                    <Link
                      href={r.profileNick ? `/jogadores/${playerSlug(r.profileNick)}` : `/jogadores/${r.userId}`}
                      className="max-w-44 truncate hover:text-brand"
                    >
                      {r.name}
                    </Link>
                  ) : (
                    <span className="max-w-44 truncate" title="Convidado (sem conta)">
                      {r.name}
                    </span>
                  )}
                  {r.elo != null && <LevelBadge elo={r.elo} />}
                </div>
              </td>
              {COLS.map((c) => (
                <td key={c.key} className="px-2 py-2.5 text-center tabular">
                  {c.render ? c.render(r) : c.value(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
