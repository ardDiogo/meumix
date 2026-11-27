"use client";

import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatDate, formatSigned } from "@/lib/format";

export interface EloPoint {
  date: string;
  elo: number;
  delta: number;
  label: string;
  /** Resultado do mix (cor do ponto); sem resultado (ajuste do admin): ponto neutro. */
  result?: "win" | "loss" | "draw" | null;
}

const DOT: Record<string, string> = {
  win: "var(--color-win)",
  loss: "var(--color-loss)",
  draw: "var(--color-draw)",
};
const shortFmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
const shortDate = (iso: string) => shortFmt.format(new Date(iso));
const RESULT_LABEL: Record<string, string> = { win: "Vitória", loss: "Derrota", draw: "Empate" };

/**
 * Evolução do ELO: linha reta entre os mixes (sem curva, para não passar do
 * valor real), um ponto por mix na cor do resultado e, com `nextLevel`, a linha
 * tracejada do próximo nível quando ela está perto da faixa do gráfico.
 */
export function EloChart({
  data,
  height = 220,
  nextLevel,
}: {
  data: EloPoint[];
  height?: number;
  nextLevel?: { level: number; min: number; color: string } | null;
}) {
  if (data.length < 2) {
    return (
      <div className="flex items-center justify-center text-sm text-muted" style={{ height }}>
        Dados insuficientes para o gráfico de evolução.
      </div>
    );
  }
  const values = data.map((d) => d.elo);
  const top = Math.max(...values);
  // A linha do próximo nível só entra se não achatar o gráfico (até 150 acima do pico).
  const level = nextLevel && nextLevel.min - top <= 150 ? nextLevel : null;
  const min = Math.floor((Math.min(...values) - 20) / 10) * 10;
  const max = Math.ceil((Math.max(top, level ? level.min : top) + 20) / 10) * 10;

  return (
    <div style={{ height }} role="img" aria-label={`Evolução do ELO de ${data[0]!.elo} para ${data.at(-1)!.elo}`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 18, bottom: 0, left: -12 }}>
          <defs>
            <linearGradient id="eloFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-brand)" stopOpacity={0.22} />
              <stop offset="100%" stopColor="var(--color-brand)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--color-border)" strokeDasharray="2 4" vertical={false} />
          <XAxis
            dataKey="date"
            // Com a data de todos os pontos, o formato curto (13/10) cabe também no celular.
            tickFormatter={(v: string) => (data.length <= 10 ? shortDate(v) : formatDate(v))}
            stroke="var(--color-subtle)"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            // Poucos mixes: a data de todos os pontos (senão o recharts pula rótulos).
            interval={data.length <= 10 ? 0 : "preserveStartEnd"}
            minTickGap={data.length <= 10 ? 0 : 24}
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
                  {p.result && (
                    <div className="mt-0.5 font-semibold" style={{ color: DOT[p.result] }}>
                      {RESULT_LABEL[p.result]}
                    </div>
                  )}
                </div>
              );
            }}
          />
          {level && (
            <ReferenceLine
              y={level.min}
              stroke={level.color}
              strokeDasharray="4 4"
              strokeOpacity={0.8}
              label={{
                value: `Nível ${level.level} · ${level.min}`,
                position: "insideTopRight",
                fill: level.color,
                fontSize: 11,
                fontWeight: 700,
              }}
            />
          )}
          <Area
            type="linear"
            dataKey="elo"
            stroke="var(--color-brand)"
            strokeWidth={2}
            fill="url(#eloFill)"
            dot={(props: { cx?: number; cy?: number; index?: number; payload?: EloPoint }) => {
              const { cx, cy, index, payload } = props;
              if (cx == null || cy == null) return <g key={index} />;
              return (
                <circle
                  key={index}
                  cx={cx}
                  cy={cy}
                  r={3.5}
                  fill={payload?.result ? DOT[payload.result] : "var(--color-brand)"}
                  stroke="var(--color-surface)"
                  strokeWidth={1.5}
                />
              );
            }}
            activeDot={{ r: 4, fill: "var(--color-brand)", stroke: "var(--color-bg)", strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
