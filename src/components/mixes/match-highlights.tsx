import {
  Bomb,
  Crosshair,
  Crown,
  DoorOpen,
  Flame,
  Focus,
  Repeat,
  Scale,
  Skull,
  Sun,
  Target,
  TrendingDown,
  Trophy,
  Zap,
} from "lucide-react";
import type { GcMapStored } from "@/lib/gc-api";
import { aggregateGc, gcHighlights, type GcHighlightKey, type GcLine } from "@/lib/gc-analysis";
import { kdrOf, matchHighlights, type HighlightKey, type StatRow } from "@/lib/match-highlights";
import { cn } from "@/lib/utils";
import { Avatar } from "../ui/avatar";
import { Card, CardContent, CardHeader } from "../ui/card";

const fmt2 = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (n: number | null) => `${Math.round(n ?? 0)}%`;

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
  kdr: {
    title: "Maior KDR",
    icon: Scale,
    box: "border-emerald-500/30 bg-emerald-500/10",
    icon_: "text-emerald-400",
    detail: (r) => `${fmt2(kdrOf(r))} KDR (${r.k}/${r.d})`,
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

/** Destaques que só existem com os dados importados da GC. */
const GC_STYLE: Record<
  GcHighlightKey,
  { title: string; icon: typeof Crown; box: string; icon_: string; detail: (l: GcLine) => string }
> = {
  entry: {
    title: "Melhor entry",
    icon: DoorOpen,
    box: "border-sky-500/30 bg-sky-500/10",
    icon_: "text-sky-400",
    detail: (l) => `${l.entries.won} de ${l.entries.duels} aberturas (${pct((l.entries.won / l.entries.duels) * 100)})`,
  },
  trader: {
    title: "Melhor trader",
    icon: Repeat,
    box: "border-teal-500/30 bg-teal-500/10",
    icon_: "text-teal-400",
    detail: (l) =>
      `${l.trades.made} trades${l.trades.avgTime != null ? ` · ${l.trades.avgTime.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}s` : ""}`,
  },
  clutch: {
    title: "Clutchzeiro",
    icon: Flame,
    box: "border-fuchsia-500/30 bg-fuchsia-500/10",
    icon_: "text-fuchsia-400",
    detail: (l) =>
      `${l.clutch.won} ${l.clutch.won === 1 ? "clutch" : "clutches"}${l.clutch.biggest ? ` · maior 1v${l.clutch.biggest}` : ""}`,
  },
  flash: {
    title: "Mais inimigos cegados",
    icon: Sun,
    box: "border-amber-300/30 bg-amber-300/10",
    icon_: "text-amber-300",
    detail: (l) => `${l.utility.flashed} cegados${l.fa ? ` · ${l.fa} flash assists` : ""}`,
  },
  nade: {
    title: "Maior dano com granada",
    icon: Bomb,
    box: "border-lime-500/30 bg-lime-500/10",
    icon_: "text-lime-400",
    detail: (l) => `${l.utility.damage} de dano · ${l.utility.grenades} granadas`,
  },
  aim: {
    title: "Melhor mira",
    icon: Focus,
    box: "border-indigo-500/30 bg-indigo-500/10",
    icon_: "text-indigo-400",
    detail: (l) => `${pct(l.aim.accuracy)} de precisão · ${pct(l.hsRate)} HS`,
  },
};

export function MatchHighlights({ rows, gc = [] }: { rows: StatRow[]; gc?: GcMapStored[] }) {
  const list = matchHighlights(rows);
  // Importado da GC: os 6 destaques novos, com o nome e a foto do jogador do mix.
  const gcList = gc.length ? gcHighlights(aggregateGc(gc)) : [];
  const personOf = (l: GcLine) =>
    rows.find((r) => (l.userId ? r.userId === l.userId : r.name === l.nick)) ?? { name: l.nick, avatarUrl: null };
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
              <li key={key} className={cn("flex items-center gap-3 rounded-lg border p-4", s.box)}>
                <Avatar name={row.name} src={row.avatarUrl} size="lg" className="rounded-lg" />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-xs text-muted">
                    <Icon className={cn("size-4 shrink-0", s.icon_)} aria-hidden /> {s.title}
                  </div>
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
          {gcList.map(({ key, line }) => {
            const s = GC_STYLE[key];
            const Icon = s.icon;
            const p = personOf(line);
            return (
              <li key={key} className={cn("flex items-center gap-3 rounded-lg border p-4", s.box)}>
                <Avatar name={p.name} src={p.avatarUrl} size="lg" className="rounded-lg" />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-xs text-muted">
                    <Icon className={cn("size-4 shrink-0", s.icon_)} aria-hidden /> {s.title}
                  </div>
                  <div className="truncate font-semibold" title={p.name}>
                    {p.name}
                  </div>
                  <span className="mt-1.5 inline-block rounded-md bg-black/30 px-2 py-0.5 text-xs font-semibold tabular">
                    {s.detail(line)}
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
