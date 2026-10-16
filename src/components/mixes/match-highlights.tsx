import { Crosshair, Crown, Skull, Target, TrendingDown, Trophy, Zap } from "lucide-react";
import { kdrOf, matchHighlights, type HighlightKey, type StatRow } from "@/lib/match-highlights";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader } from "../ui/card";

const fmt2 = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STYLE: Record<
  HighlightKey,
  { title: string; icon: typeof Crown; box: string; icon_: string; detail: (r: StatRow) => string }
> = {
  mvp: {
    title: "MVP",
    icon: Crown,
    box: "border-purple-500/40 bg-purple-500/10 shadow-[0_0_24px_-6px] shadow-purple-500/40",
    icon_: "text-purple-400",
    detail: (r) => `${r.k}K / ${r.a}A / ${r.d}D`,
  },
  kills: {
    title: "Maior matador",
    icon: Trophy,
    box: "border-yellow-500/30 bg-yellow-500/10",
    icon_: "text-yellow-400",
    detail: (r) => `${r.k} kills`,
  },
  adr: {
    title: "Maior ADR",
    icon: Crosshair,
    box: "border-orange-500/30 bg-orange-500/10",
    icon_: "text-orange-400",
    detail: (r) => `${fmt2(r.adr ?? 0)} ADR`,
  },
  fk: {
    title: "Mais first kills",
    icon: Zap,
    box: "border-cyan-500/30 bg-cyan-500/10",
    icon_: "text-cyan-400",
    detail: (r) => `${r.fk} first kills`,
  },
  assists: {
    title: "Mais assistências",
    icon: Target,
    box: "border-blue-500/30 bg-blue-500/10",
    icon_: "text-blue-400",
    detail: (r) => `${r.a} assists`,
  },
  deaths: {
    title: "Mais mortes",
    icon: Skull,
    box: "border-red-500/30 bg-red-500/10",
    icon_: "text-red-400",
    detail: (r) => `${r.d} mortes`,
  },
  worst: {
    title: "Pior performance",
    icon: TrendingDown,
    box: "border-border bg-surface-2",
    icon_: "text-muted",
    detail: (r) => `${r.k}K${r.adr != null ? ` / ${fmt2(r.adr)} ADR` : ""} / ${fmt2(kdrOf(r))} KDR`,
  },
};

export function MatchHighlights({ rows }: { rows: StatRow[] }) {
  const list = matchHighlights(rows);
  if (!list.length) return null;
  return (
    <Card>
      <CardHeader title="Destaques da partida" />
      <CardContent>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {list.map(({ key, row }) => {
            const s = STYLE[key];
            const Icon = s.icon;
            return (
              <li key={key} className={cn("flex gap-3 rounded-lg border p-4", s.box)}>
                <Icon className={cn("size-5 shrink-0", s.icon_)} aria-hidden />
                <div className="min-w-0">
                  <div className="text-xs text-muted">{s.title}</div>
                  <div className="truncate font-semibold" title={row.name}>
                    {row.name}
                  </div>
                  <span className="mt-1.5 inline-block rounded-md bg-black/30 px-2 py-0.5 text-xs font-semibold tabular">
                    {s.detail(row)}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
