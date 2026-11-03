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
import {
  aggregateGc,
  GC_HIGHLIGHT_TEXT,
  gcHighlights,
  orderHighlights,
  type GcHighlightKey,
  type GcLine,
} from "@/lib/gc-analysis";
import { kdrOf, matchHighlights, type HighlightKey, type StatRow } from "@/lib/match-highlights";
import { cn } from "@/lib/utils";
import { Avatar } from "../ui/avatar";
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

/** Ícone e cores dos destaques que só existem com os dados importados da GC. */
const GC_STYLE: Record<GcHighlightKey, { icon: typeof Crown; box: string; icon_: string }> = {
  entry: { icon: DoorOpen, box: "border-sky-500/30 bg-sky-500/10", icon_: "text-sky-400" },
  trader: { icon: Repeat, box: "border-teal-500/30 bg-teal-500/10", icon_: "text-teal-400" },
  clutch: { icon: Flame, box: "border-fuchsia-500/30 bg-fuchsia-500/10", icon_: "text-fuchsia-400" },
  flash: { icon: Sun, box: "border-amber-300/30 bg-amber-300/10", icon_: "text-amber-300" },
  nade: { icon: Bomb, box: "border-lime-500/30 bg-lime-500/10", icon_: "text-lime-400" },
  aim: { icon: Focus, box: "border-indigo-500/30 bg-indigo-500/10", icon_: "text-indigo-400" },
};

type CardItem = {
  key: string;
  name: string;
  avatarUrl: string | null;
  style: { title: string; icon: typeof Crown; box: string; icon_: string };
  detail: string;
};

export function MatchHighlights({ rows, gc = [] }: { rows: StatRow[]; gc?: GcMapStored[] }) {
  const list = matchHighlights(rows);
  if (!list.length) return null;
  // Importado da GC: os 6 destaques novos, com o nome e a foto do jogador do mix.
  const gcList = gc.length ? gcHighlights(aggregateGc(gc)) : [];
  const personOf = (l: GcLine) =>
    rows.find((r) => (l.userId ? r.userId === l.userId : r.name === l.nick)) ?? { name: l.nick, avatarUrl: null };
  const cards: CardItem[] = orderHighlights(list, gcList).map(({ stat, gc: g }) => {
    if (stat) {
      const st = STYLE[stat.key];
      return {
        key: stat.key,
        name: stat.row.name,
        avatarUrl: stat.row.avatarUrl,
        style: st,
        detail: st.detail(stat.row),
      };
    }
    const p = personOf(g.line);
    const t = GC_HIGHLIGHT_TEXT[g.key];
    return {
      key: `gc-${g.key}`,
      name: p.name,
      avatarUrl: p.avatarUrl,
      style: { ...GC_STYLE[g.key], title: t.title },
      detail: t.detail(g.line),
    };
  });
  return (
    <Card>
      <CardHeader title="Destaques da partida" />
      <CardContent>
        <ul className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {cards.map(({ key, name, avatarUrl, style: s, detail }) => {
            const Icon = s.icon;
            return (
              <li
                key={key}
                className={cn("flex items-center gap-2 rounded-lg border px-2 py-2 sm:gap-2.5 sm:px-2.5", s.box)}
              >
                {/* Foto menor no celular, para sobrar espaço para o texto. */}
                <Avatar name={name} src={avatarUrl} size="sm" className="shrink-0 rounded-md sm:size-10" />
                <div className="min-w-0">
                  <div className="flex items-center gap-1 text-[11px] leading-tight text-muted">
                    <Icon className={cn("size-3.5 shrink-0", s.icon_)} aria-hidden />
                    <span className="sm:truncate">{s.title}</span>
                  </div>
                  <div className="truncate text-sm leading-snug font-semibold" title={name}>
                    {name}
                  </div>
                  <div className="text-[11px] font-semibold text-muted tabular sm:truncate" title={detail}>
                    {detail}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
