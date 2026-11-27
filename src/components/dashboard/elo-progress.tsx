"use client";

import { levelForElo } from "@/lib/levels";
import { cn } from "@/lib/utils";
import { useLevels } from "../players/levels-context";

/** Barrinha até o próximo nível, com o quanto falta (nível 10: "nível máximo"). */
export function LevelProgress({ elo }: { elo: number }) {
  const levels = useLevels();
  const cur = levelForElo(elo, levels);
  const next = levels.find((l) => l.level === cur.level + 1);
  const pct = next ? Math.min(100, Math.max(0, ((elo - cur.min) / (next.min - cur.min)) * 100)) : 100;
  return (
    <div className="mt-1" title={next ? `${elo} de ${next.min} de ELO para o nível ${next.level}` : "Nível máximo"}>
      <div className="h-1 overflow-hidden rounded-full bg-border">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: next?.color ?? cur.color }} />
      </div>
      <div className="mt-0.5 truncate text-[10px] text-muted tabular">
        {next ? (
          <>
            <span className="hidden sm:inline">faltam </span>
            <b className="text-fg">{next.min - elo}</b> p/ <span className="sm:hidden">nv</span>
            <span className="hidden sm:inline">nível</span> {next.level}
          </>
        ) : (
          "nível máximo"
        )}
      </div>
    </div>
  );
}

/** Mini gráfico do ELO nos últimos mixes; o último ponto é este mix. */
export function EloSparkline({ values, className }: { values: number[]; className?: string }) {
  if (values.length < 2) return null;
  const w = 64;
  const h = 18;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - 2 - ((v - min) / span) * (h - 4)] as const);
  const up = values.at(-1)! >= values[0]!;
  const color = up ? "var(--color-win)" : "var(--color-loss)";
  const [lx, ly] = pts.at(-1)!;
  return (
    <svg
      viewBox={`-2 0 ${w + 4} ${h}`}
      preserveAspectRatio="none"
      className={cn("h-[18px] w-12 sm:w-16", className)}
      role="img"
      aria-label={`ELO nos últimos ${values.length - 1} mixes: de ${values[0]} para ${values.at(-1)}`}
    >
      <title>{`Últimos ${values.length - 1} mixes: ${values[0]} → ${values.at(-1)}`}</title>
      <polyline
        points={pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity={0.85}
      />
      <circle cx={lx} cy={ly} r={2} fill={color} />
    </svg>
  );
}
