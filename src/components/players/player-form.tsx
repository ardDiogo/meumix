"use client";

import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatDate, formatDecimal, formatPercent } from "@/lib/format";
import { formCompare, type FormMetric, type FormPoint } from "@/lib/player-form";
import { cn } from "@/lib/utils";
import { Card, CardHeader } from "../ui/card";

const WINDOW = 5;

const METRICS: {
  key: FormMetric;
  title: string;
  hint: string;
  format: (n: number | null) => string;
  /** Faixas de referência para o rótulo (abaixo / média / bom). */
  good: number;
  bad: number;
}[] = [
  {
    key: "rating",
    title: "Nota geral",
    hint: "Aproximação do Rating 2.0 (HLTV): 1,00 é a média.",
    format: (n) => formatDecimal(n),
    good: 1.1,
    bad: 0.9,
  },
  { key: "kd", title: "K/D", hint: "Abates por morte.", format: (n) => formatDecimal(n), good: 1.1, bad: 0.9 },
  { key: "adr", title: "ADR", hint: "Dano médio por round.", format: (n) => formatDecimal(n, 1), good: 85, bad: 65 },
  {
    key: "kast",
    title: "KAST",
    hint: "% de rounds com kill, assistência, sobrevivência ou trade.",
    format: (n) => formatPercent(n, 1),
    good: 72,
    bad: 62,
  },
  {
    key: "winRate",
    title: "Vitórias",
    hint: "% de mixes vencidos.",
    format: (n) => formatPercent(n),
    good: 55,
    bad: 45,
  },
];

const RANGES = [
  { key: 10, label: "10 mixes" },
  { key: 30, label: "30" },
  { key: 0, label: "Todos" },
] as const;

/**
 * Evolução do jogador: média dos últimos 5 mixes contra os 5 anteriores e
 * gráfico da métrica escolhida ao longo dos mixes.
 */
export function PlayerForm({ points }: { points: FormPoint[] }) {
  const [metric, setMetric] = useState<FormMetric>("rating");
  const [range, setRange] = useState<number>(10);
  const def = METRICS.find((m) => m.key === metric)!;
  const shown = range ? points.slice(-range) : points;
  const values = shown.map((p) => p[metric]).filter((v): v is number => v != null);
  const average = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;

  return (
    <Card className="mt-4">
      <CardHeader
        title="Forma do jogador"
        description={`Últimos ${WINDOW} mixes comparados aos ${WINDOW} anteriores. Toque num indicador para ver a evolução.`}
      />
      <div className="grid gap-3 px-4 pt-4 sm:grid-cols-2 lg:grid-cols-5">
        {METRICS.map((m) => {
          const c = formCompare(points, m.key, WINDOW);
          const diff = c.current != null && c.previous != null ? c.current - c.previous : null;
          const trend = diff == null || Math.abs(diff) < 1e-9 ? "flat" : diff > 0 ? "up" : "down";
          const level =
            c.current == null ? null : c.current >= m.good ? "Bom" : c.current <= m.bad ? "Abaixo" : "Médio";
          const selected = metric === m.key;
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => setMetric(m.key)}
              aria-pressed={selected}
              className={cn(
                "rounded-lg border bg-surface-2 p-3 text-left transition-colors",
                selected ? "border-brand/60 ring-1 ring-brand/40" : "border-border hover:border-border-strong",
              )}
            >
              <div className="text-xs font-semibold tracking-wide text-muted uppercase">{m.title}</div>
              <div className="mt-1 flex items-end gap-2">
                <span className="font-display text-2xl font-bold tabular">{m.format(c.current)}</span>
                {trend === "up" && <ArrowUpRight className="mb-1 size-4 text-win" aria-label="Melhorando" />}
                {trend === "down" && <ArrowDownRight className="mb-1 size-4 text-loss" aria-label="Caindo" />}
                {trend === "flat" && diff != null && <Minus className="mb-1 size-4 text-muted" aria-label="Estável" />}
              </div>
              <div className="mt-1 text-xs text-subtle">
                {c.previousCount ? (
                  <>
                    Anteriores: <span className="text-muted tabular">{m.format(c.previous)}</span>
                  </>
                ) : (
                  "Sem mixes anteriores para comparar"
                )}
              </div>
              {level && (
                <div
                  className={cn(
                    "mt-2 inline-block rounded px-1.5 py-0.5 text-[11px] font-medium",
                    level === "Bom" && "bg-win/15 text-win",
                    level === "Médio" && "bg-draw/15 text-draw",
                    level === "Abaixo" && "bg-loss/15 text-loss",
                  )}
                >
                  {level}
                </div>
              )}
            </button>
          );
        })}
      </div>

      <div className="px-4 pt-4 pb-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted">
            <span className="font-medium text-fg">{def.title}</span> por mix · {def.hint}
          </p>
          <div className="flex gap-1" role="group" aria-label="Período">
            {RANGES.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => setRange(r.key)}
                aria-pressed={range === r.key}
                className={cn(
                  "rounded-md px-2 py-1 text-xs font-medium",
                  range === r.key ? "bg-surface-2 text-fg" : "text-muted hover:text-fg",
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
        {values.length < 2 ? (
          <div className="flex h-56 items-center justify-center text-sm text-muted">
            Jogue pelo menos 2 mixes para ver a evolução.
          </div>
        ) : (
          <div className="h-56" role="img" aria-label={`Evolução de ${def.title} nos últimos ${shown.length} mixes`}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={shown} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="2 4" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(v: string) => formatDate(v)}
                  stroke="var(--color-subtle)"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={24}
                />
                <YAxis
                  domain={["auto", "auto"]}
                  stroke="var(--color-subtle)"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={48}
                  tickFormatter={(v: number) => def.format(v)}
                />
                {average != null && (
                  <ReferenceLine y={average} stroke="var(--color-border-strong)" strokeDasharray="4 4" />
                )}
                <Tooltip
                  cursor={{ stroke: "var(--color-border-strong)" }}
                  content={({ active, payload }) => {
                    const p = active ? (payload?.[0]?.payload as FormPoint | undefined) : undefined;
                    if (!p) return null;
                    return (
                      <div className="rounded-md border border-border bg-surface-2 px-3 py-2 text-xs shadow-lg">
                        <div className="text-muted">
                          {p.label} · {formatDate(p.date)}
                        </div>
                        <div className="mt-0.5 font-display text-base font-bold text-fg tabular">
                          {def.format(p[metric])}
                        </div>
                        <div
                          className={p.result === "win" ? "text-win" : p.result === "loss" ? "text-loss" : "text-muted"}
                        >
                          {p.result === "win" ? "Vitória" : p.result === "loss" ? "Derrota" : "Empate"}
                          {p.score && ` · ${p.score}`}
                        </div>
                      </div>
                    );
                  }}
                />
                <Line
                  type="monotone"
                  dataKey={metric}
                  stroke="var(--color-brand)"
                  strokeWidth={2}
                  connectNulls
                  dot={{ r: 4, fill: "var(--color-brand)", stroke: "var(--color-surface)", strokeWidth: 2 }}
                  activeDot={{ r: 5, fill: "var(--color-brand)", stroke: "var(--color-bg)", strokeWidth: 2 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        {average != null && values.length >= 2 && (
          <p className="mt-2 text-xs text-subtle">Linha tracejada: média do período ({def.format(average)}).</p>
        )}
      </div>
    </Card>
  );
}
