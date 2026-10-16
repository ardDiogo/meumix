"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatDate, formatSigned } from "@/lib/format";

export interface EloPoint {
  date: string;
  elo: number;
  delta: number;
  label: string;
}

export function EloChart({ data, height = 220 }: { data: EloPoint[]; height?: number }) {
  if (data.length < 2) {
    return (
      <div className="flex items-center justify-center text-sm text-muted" style={{ height }}>
        Dados insuficientes para o gráfico de evolução.
      </div>
    );
  }
  const values = data.map((d) => d.elo);
  const min = Math.floor((Math.min(...values) - 20) / 10) * 10;
  const max = Math.ceil((Math.max(...values) + 20) / 10) * 10;

  return (
    <div style={{ height }} role="img" aria-label={`Evolução do ELO de ${data[0]!.elo} para ${data.at(-1)!.elo}`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <defs>
            <linearGradient id="eloFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-brand)" stopOpacity={0.22} />
              <stop offset="100%" stopColor="var(--color-brand)" stopOpacity={0} />
            </linearGradient>
          </defs>
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
            domain={[min, max]}
            stroke="var(--color-subtle)"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={48}
          />
          <Tooltip
            cursor={{ stroke: "var(--color-border-strong)" }}
            content={({ active, payload }) => {
              const p = active ? (payload?.[0]?.payload as EloPoint | undefined) : undefined;
              if (!p) return null;
              return (
                <div className="rounded-md border border-border bg-surface-2 px-3 py-2 text-xs shadow-lg">
                  <div className="text-muted">
                    {p.label} · {formatDate(p.date)}
                  </div>
                  <div className="mt-0.5 font-display text-base font-bold text-fg tabular">
                    {p.elo} <span className={p.delta >= 0 ? "text-win" : "text-loss"}>({formatSigned(p.delta)})</span>
                  </div>
                </div>
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="elo"
            stroke="var(--color-brand)"
            strokeWidth={2}
            fill="url(#eloFill)"
            dot={false}
            activeDot={{ r: 4, fill: "var(--color-brand)", stroke: "var(--color-bg)", strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
