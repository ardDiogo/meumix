"use client";

import { useState } from "react";
import { kdrOf, type StatRow } from "@/lib/match-highlights";
import { cn } from "@/lib/utils";
import type { PlayerAverage } from "@/services/match-report";
import { Avatar } from "../ui/avatar";

type Metric = "kdr" | "adr" | "fk" | "kast" | "elo";

const METRICS: { key: Metric; label: string; digits: number; suffix?: string }[] = [
  { key: "kdr", label: "KDR", digits: 2 },
  { key: "adr", label: "ADR", digits: 1 },
  { key: "fk", label: "FK", digits: 0 },
  { key: "kast", label: "KAST", digits: 1, suffix: "%" },
  { key: "elo", label: "ELO", digits: 0 },
];

const valueOf = (r: StatRow, m: Metric): number | null =>
  m === "kdr" ? kdrOf(r) : m === "adr" ? r.adr : m === "fk" ? r.fk : m === "kast" ? r.kast : (r.eloDelta ?? null);

const fmt = (n: number, digits: number) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const signed = (n: number, digits: number) => (n > 0 ? "+" : n < 0 ? "−" : "±") + fmt(Math.abs(n), digits);

/**
 * Desempenho no mix: uma barra por jogador na estatística escolhida, na cor
 * do time e do melhor para o pior. O tracinho é a média do jogador nas
 * outras partidas (passou dele = jogou acima do normal). No ELO, a barra é o
 * ganho ou a perda do mix, a partir do centro.
 */
export function MatchPerformance({
  rows,
  averages,
  teamNames,
}: {
  rows: StatRow[];
  averages: Record<string, PlayerAverage>;
  teamNames: [string, string];
}) {
  const [metric, setMetric] = useState<Metric>("kdr");
  const spec = METRICS.find((m) => m.key === metric)!;
  const elo = metric === "elo";
  const avgOf = (r: StatRow) => {
    const a = r.userId ? averages[r.userId] : undefined;
    return a && !elo ? (a[metric as Exclude<Metric, "elo">] ?? null) : null;
  };
  // Ordem: quem mais passou da própria média primeiro; sem média (estreia,
  // convidado) vai para o fim, pelo valor. No ELO, pelo ganho.
  const diffOf = (x: { v: number | null; avg: number | null }) => (x.v != null && x.avg != null ? x.v - x.avg : null);
  const items = rows
    .map((r) => ({ r, v: valueOf(r, metric), avg: avgOf(r) }))
    .sort(
      (a, b) =>
        Number(diffOf(b) != null) - Number(diffOf(a) != null) ||
        (diffOf(b) ?? 0) - (diffOf(a) ?? 0) ||
        (b.v ?? -Infinity) - (a.v ?? -Infinity) ||
        a.r.name.localeCompare(b.r.name),
    );
  const scale = Math.max(...items.flatMap((x) => [Math.abs(x.v ?? 0), x.avg ?? 0]), elo ? 1 : 0.01);
  const name = (r: StatRow) => r.profileNick ?? r.name;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Estatística"
          className="inline-flex max-w-full overflow-x-auto rounded-md border border-border bg-surface p-0.5"
        >
          {METRICS.map((m) => (
            <button
              key={m.key}
              type="button"
              role="tab"
              aria-selected={m.key === metric}
              onClick={() => setMetric(m.key)}
              className={cn(
                "flex h-8 items-center rounded-[5px] px-3 text-sm font-medium whitespace-nowrap transition-colors",
                m.key === metric ? "bg-surface-3 text-fg" : "text-muted hover:text-fg",
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
          {elo ? (
            <>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-win" aria-hidden /> Ganhou ELO
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-loss" aria-hidden /> Perdeu ELO
              </span>
            </>
          ) : (
            <>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-team-a" aria-hidden /> {teamNames[0]}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-team-b" aria-hidden /> {teamNames[1]}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-0.5 rounded-full bg-fg" aria-hidden /> Média dele nos outros mixes
              </span>
            </>
          )}
        </div>
      </div>

      <ol className="space-y-1">
        {items.map(({ r, v, avg }, i) => {
          const diff = diffOf({ v, avg });
          const label = v == null ? "—" : elo ? signed(v, 0) : `${fmt(v, spec.digits)}${spec.suffix ?? ""}`;
          return (
            <li
              key={r.key}
              className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 rounded-md px-1 py-1 hover:bg-surface-2/60 sm:grid-cols-[1.5rem_minmax(0,11rem)_1fr_9rem] sm:gap-x-3"
            >
              <span className="text-center text-xs text-muted tabular">{i + 1}</span>
              <span className="flex min-w-0 items-center gap-2">
                <Avatar name={name(r)} src={r.avatarUrl} size="xs" />
                <span className="truncate text-sm font-medium">{name(r)}</span>
              </span>
              {/* No celular, a barra vai para a linha de baixo, com a largura toda. */}
              <span
                className="relative order-last col-span-2 col-start-2 h-3.5 sm:order-none sm:col-span-1 sm:col-start-auto"
                aria-hidden
              >
                {elo ? (
                  <>
                    <span className="absolute inset-y-0 left-1/2 w-px bg-border-strong" />
                    {v != null && v !== 0 && (
                      <span
                        className={cn(
                          "absolute inset-y-0",
                          v > 0 ? "left-1/2 rounded-r-sm bg-win" : "rounded-l-sm bg-loss",
                        )}
                        style={
                          v > 0 ? { width: `${(v / scale) * 50}%` } : { right: "50%", width: `${(-v / scale) * 50}%` }
                        }
                      />
                    )}
                  </>
                ) : (
                  <>
                    <span className="absolute inset-0 rounded-sm bg-surface-2" />
                    {v != null && v > 0 && (
                      <span
                        className={cn(
                          "absolute inset-y-0 left-0 rounded-sm",
                          r.team === "A" ? "bg-team-a" : "bg-team-b",
                        )}
                        style={{ width: `${(v / scale) * 100}%` }}
                      />
                    )}
                    {avg != null && (
                      <span
                        className="absolute -inset-y-1 w-0.5 -translate-x-1/2 rounded-full bg-fg"
                        style={{ left: `${(avg / scale) * 100}%` }}
                      />
                    )}
                  </>
                )}
              </span>
              <span className="text-right text-xs whitespace-nowrap text-muted tabular">
                <span
                  className={cn(
                    "text-sm font-semibold",
                    elo && v != null ? (v > 0 ? "text-win" : v < 0 ? "text-loss" : "text-fg") : "text-fg",
                  )}
                >
                  {label}
                </span>
                {!elo && (
                  <>
                    {" "}
                    {diff != null ? (
                      <span
                        className={diff > 0 ? "text-win" : diff < 0 ? "text-loss" : ""}
                        title={`Média nos outros mixes: ${fmt(avg!, spec.digits)}${spec.suffix ?? ""}`}
                      >
                        {signed(diff, spec.digits)}
                      </span>
                    ) : (
                      <span className="text-subtle">{r.userId ? "estreia" : "convidado"}</span>
                    )}
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
