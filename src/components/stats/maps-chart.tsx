"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function MapsChart({ data }: { data: { name: string; played: number }[] }) {
  return (
    <div
      style={{ height: Math.max(160, data.length * 36) }}
      role="img"
      aria-label="Quantidade de vezes que cada mapa foi jogado"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--color-border)" strokeDasharray="2 4" horizontal={false} />
          <XAxis
            type="number"
            allowDecimals={false}
            stroke="var(--color-subtle)"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={72}
            stroke="var(--color-muted)"
            tick={{ fontSize: 12 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            cursor={{ fill: "var(--color-surface-2)" }}
            content={({ active, payload }) => {
              const p = active ? payload?.[0]?.payload : undefined;
              if (!p) return null;
              return (
                <div className="rounded-md border border-border bg-surface-2 px-3 py-2 text-xs shadow-lg">
                  <span className="font-medium text-fg">{p.name}</span> · {p.played} {p.played === 1 ? "vez" : "vezes"}
                </div>
              );
            }}
          />
          <Bar
            dataKey="played"
            fill="var(--color-brand)"
            radius={[0, 3, 3, 0]}
            barSize={14}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
