"use client";

import { useState } from "react";
import type { StatRow } from "@/lib/match-highlights";
import { cn } from "@/lib/utils";
import type { PlayerAverage } from "@/services/match-report";
import { FLOOR, NO_AVG, overall, statOf, toneColor, YELLOW, type Stat } from "@/lib/performance";
import { Avatar } from "../ui/avatar";

type Metric = "geral" | "kdr" | "adr" | "fk" | "kast" | "rating" | "swing" | "elo";

/** `gc`: só com os dados importados da GC (GC Rating e Swing). */
const METRICS: { key: Metric; label: string; digits: number; suffix?: string; gc?: boolean }[] = [
  { key: "geral", label: "Geral", digits: 0, suffix: "%" },
  { key: "kdr", label: "KDR", digits: 2 },
  { key: "adr", label: "ADR", digits: 1 },
  { key: "fk", label: "FK", digits: 0 },
  { key: "kast", label: "KAST", digits: 1, suffix: "%" },
  { key: "rating", label: "Rating", digits: 2, gc: true },
  { key: "swing", label: "Swing", digits: 1, suffix: "%", gc: true },
  { key: "elo", label: "ELO", digits: 0 },
];

/** Base da cor (quanto é "muito" acima ou abaixo): Rating 0,5; Swing em pontos percentuais, 5. */
const GC_FLOOR = { rating: 0.5, swing: 5 };

const fmt = (n: number, digits: number) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const signed = (n: number, digits: number) => (n > 0 ? "+" : n < 0 ? "−" : "±") + fmt(Math.abs(n), digits);

/**
 * Desempenho no mix: uma barra por jogador na estatística escolhida, colorida
 * pela distância da média dele (verde acima, amarelo perto, vermelho abaixo), de quem mais passou da própria média para quem ficou mais abaixo.
 * O tracinho é a média do jogador nas outras partidas. No Geral (as 4
 * estatísticas juntas, em %) e no ELO, a barra sai do centro.
 */
export function MatchPerformance({
  rows,
  averages,
  teamNames,
  gcNow = {},
}: {
  rows: StatRow[];
  averages: Record<string, PlayerAverage>;
  teamNames: [string, string];
  /** GC Rating e Swing deste mix por jogador (mix importado da GC). */
  gcNow?: Record<string, { rating: number | null; swing: number | null }>;
}) {
  const [metric, setMetric] = useState<Metric>("geral");
  const hasGc = Object.keys(gcNow).length > 0;
  const metrics = METRICS.filter((m) => !m.gc || hasGc);
  const spec = METRICS.find((m) => m.key === metric)!;
  const elo = metric === "elo";
  const geral = metric === "geral";
  const swing = metric === "swing";
  const gcMetric = metric === "rating" || swing;
  // Geral, Swing e ELO: barra a partir do centro (positivo à direita, negativo à esquerda).
  const centered = elo || geral || swing;
  const avgFor = (r: StatRow) => (r.userId ? averages[r.userId] : undefined);
  // Swing em pontos percentuais (0,021 → 2,1).
  const gcValue = (v: number | null | undefined) => (v == null ? null : swing ? v * 100 : v);
  const avgOf = (r: StatRow) =>
    gcMetric
      ? gcValue(avgFor(r)?.[metric as "rating" | "swing"])
      : centered
        ? null
        : (avgFor(r)?.[metric as Stat] ?? null);
  const valueOf = (r: StatRow) =>
    elo
      ? (r.eloDelta ?? null)
      : geral
        ? (overall(r, avgFor(r))?.value ?? null)
        : gcMetric
          ? gcValue(r.userId ? gcNow[r.userId]?.[metric as "rating" | "swing"] : null)
          : statOf(r, metric as Stat);
  // Ordem: quem mais passou da própria média primeiro; sem média (estreia,
  // convidado) vai para o fim, pelo valor. No ELO, pelo ganho.
  const diffOf = (x: { v: number | null; avg: number | null }) => (x.v != null && x.avg != null ? x.v - x.avg : null);
  const items = rows
    .map((r) => ({ r, v: valueOf(r), avg: avgOf(r) }))
    .sort(
      (a, b) =>
        Number(diffOf(b) != null) - Number(diffOf(a) != null) ||
        (diffOf(b) ?? 0) - (diffOf(a) ?? 0) ||
        (b.v ?? -Infinity) - (a.v ?? -Infinity) ||
        a.r.name.localeCompare(b.r.name),
    );
  const scale = Math.max(...items.flatMap((x) => [Math.abs(x.v ?? 0), Math.abs(x.avg ?? 0)]), centered ? 1 : 0.01);
  const name = (r: StatRow) => r.profileNick ?? r.name;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Estatística"
          className="inline-flex max-w-full overflow-x-auto rounded-md border border-border bg-surface p-0.5"
        >
          {metrics.map((m) => (
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
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-team-a" aria-hidden /> {teamNames[0]}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-team-b" aria-hidden /> {teamNames[1]}
          </span>
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
                <span className="size-2.5 rounded-sm bg-win" aria-hidden /> Acima da média
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm" style={{ backgroundColor: YELLOW }} aria-hidden /> Na média
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-loss" aria-hidden /> Abaixo da média
              </span>
              {!geral && (
                <span className="flex items-center gap-1.5">
                  <span className="h-3 w-0.5 rounded-full bg-fg" aria-hidden /> Média dele
                </span>
              )}
            </>
          )}
        </div>
      </div>

      <ol className="space-y-1">
        {items.map(({ r, v, avg }, i) => {
          const diff = diffOf({ v, avg });
          // Cor da barra: pela distância da média (no Geral, o próprio %).
          const rel = geral
            ? v != null
              ? v / 100
              : null
            : diff != null
              ? gcMetric
                ? diff / (swing ? GC_FLOOR.swing : Math.max(avg!, GC_FLOOR.rating))
                : diff / Math.max(avg!, FLOOR[metric as Stat])
              : null;
          const color = rel != null ? toneColor(rel) : NO_AVG;
          const label =
            v == null
              ? geral
                ? r.userId
                  ? "estreia"
                  : "convidado"
                : "—"
              : centered
                ? `${signed(v, spec.digits)}${spec.suffix ?? ""}`
                : `${fmt(v, spec.digits)}${spec.suffix ?? ""}`;
          // Geral: o detalhe de cada estatística ao passar o mouse.
          const breakdown = geral
            ? overall(r, avgFor(r))
                ?.parts.map((p) => `${p.k.toUpperCase()} ${signed(p.pct, 0)}%`)
                .join(" · ")
            : undefined;
          return (
            <li
              key={r.key}
              title={breakdown}
              className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 rounded-md px-1 py-1 hover:bg-surface-2/60 sm:grid-cols-[1.5rem_minmax(0,11rem)_1fr_9rem] sm:gap-x-3"
            >
              <span className="text-center text-xs text-muted tabular">{i + 1}</span>
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className={cn("size-2 shrink-0 rounded-full", r.team === "A" ? "bg-team-a" : "bg-team-b")}
                  title={teamNames[r.team === "A" ? 0 : 1]}
                />
                <Avatar name={name(r)} src={r.avatarUrl} size="xs" />
                <span className="truncate text-sm font-medium">{name(r)}</span>
              </span>
              {/* No celular, a barra vai para a linha de baixo, com a largura toda. */}
              <span
                className="relative order-last col-span-2 col-start-2 h-3.5 sm:order-none sm:col-span-1 sm:col-start-auto"
                aria-hidden
              >
                {centered ? (
                  <>
                    <span className="absolute inset-y-0 left-1/2 w-px bg-border-strong" />
                    {swing && avg != null && (
                      <span
                        className="absolute -inset-y-1 z-10 w-0.5 -translate-x-1/2 rounded-full bg-fg"
                        style={{ left: `${50 + (avg / scale) * 50}%` }}
                      />
                    )}
                    {v != null && v !== 0 && (
                      <span
                        className={cn(
                          "absolute inset-y-0",
                          v > 0 ? "left-1/2 rounded-r-sm" : "rounded-l-sm",
                          elo && (v > 0 ? "bg-win" : "bg-loss"),
                        )}
                        style={{
                          ...(v > 0
                            ? { width: `${(v / scale) * 50}%` }
                            : { right: "50%", width: `${(-v / scale) * 50}%` }),
                          ...(elo ? {} : { backgroundColor: color }),
                        }}
                      />
                    )}
                  </>
                ) : (
                  <>
                    <span className="absolute inset-0 rounded-sm bg-surface-2" />
                    {v != null && v > 0 && (
                      <span
                        className="absolute inset-y-0 left-0 rounded-sm"
                        style={{ width: `${(v / scale) * 100}%`, backgroundColor: color }}
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
                    elo && v != null
                      ? v > 0
                        ? "text-win"
                        : v < 0
                          ? "text-loss"
                          : "text-fg"
                      : v == null
                        ? "text-subtle"
                        : "text-fg",
                  )}
                  style={(geral || swing) && v != null ? { color } : undefined}
                >
                  {label}
                </span>
                {(!centered || swing) && (
                  <>
                    {" "}
                    {diff != null ? (
                      <span
                        style={{ color }}
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
