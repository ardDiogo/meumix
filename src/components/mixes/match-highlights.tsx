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

/**
 * Destaques no mesmo layout da imagem compartilhada: MVP em destaque à
 * esquerda, os outros destaques em grade e o lanterna num card médio embaixo.
 */
export function MatchHighlights({ rows, gc = [] }: { rows: StatRow[]; gc?: GcMapStored[] }) {
  const list = matchHighlights(rows);
  if (!list.length) return null;
  const mvp = list.find((h) => h.key === "mvp")?.row ?? null;
  const worst = list.find((h) => h.key === "worst")?.row ?? null;
  // Importado da GC: os 6 destaques novos, com o nome e a foto do jogador do mix.
  const gcList = gc.length ? gcHighlights(aggregateGc(gc)) : [];
  const personOf = (l: GcLine) =>
    rows.find((r) => (l.userId ? r.userId === l.userId : r.name === l.nick)) ?? { name: l.nick, avatarUrl: null };
  const cards: CardItem[] = orderHighlights(
    list.filter((h) => h.key !== "mvp" && h.key !== "worst"),
    gcList,
  ).map(({ stat, gc: g }) => {
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
  const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

  return (
    <Card>
      <CardHeader title="Destaques da partida" />
      <CardContent className="grid gap-3 md:grid-cols-[15rem_1fr]">
        {mvp && (
          <div className="flex flex-col items-center justify-center rounded-xl border border-purple-500/55 bg-gradient-to-b from-purple-500/25 via-surface/90 to-surface px-4 py-5 text-center shadow-[0_0_28px_-8px] shadow-purple-500/50">
            <span className="text-[11px] font-bold tracking-[0.25em] text-purple-400 uppercase">MVP da partida</span>
            <Avatar
              name={mvp.name}
              src={mvp.avatarUrl}
              size="xl"
              className="mt-3 size-24 rounded-2xl border-[3px] border-purple-500 text-3xl"
            />
            <span className="mt-3 max-w-full truncate font-display text-2xl font-bold" title={mvp.name}>
              {mvp.name}
            </span>
            <span className="text-sm text-muted tabular">
              {mvp.k}K / {mvp.a}A / {mvp.d}D
            </span>
            <span className="mt-2 rounded-full bg-purple-500/15 px-3 py-0.5 text-xs font-bold text-purple-400 tabular">
              {signed(mvp.rp)} RP · {fmt2(kdrOf(mvp))} KDR
            </span>
          </div>
        )}
        <div className="min-w-0 space-y-2.5">
          <ul className="grid grid-cols-2 gap-2 lg:grid-cols-3">
            {cards.map(({ key, name, avatarUrl, style: s, detail }) => (
              <li
                key={key}
                className={cn("flex items-center gap-2 rounded-lg border px-2 py-2 sm:gap-2.5 sm:px-3", s.box)}
              >
                {/* Foto menor no celular, para sobrar espaço para o texto. */}
                <Avatar name={name} src={avatarUrl} size="sm" className="shrink-0 rounded-md sm:size-10" />
                <div className="min-w-0">
                  <div className={cn("text-[11px] leading-tight font-semibold sm:truncate sm:text-xs", s.icon_)}>
                    {s.title}
                  </div>
                  <div className="truncate text-sm leading-snug font-bold sm:text-base" title={name}>
                    {name}
                  </div>
                  <div className="truncate text-[11px] text-muted tabular sm:text-xs" title={detail}>
                    {detail}
                  </div>
                </div>
              </li>
            ))}
          </ul>
          {worst && (
            <div className="flex items-center gap-3 rounded-xl border border-loss/50 bg-gradient-to-r from-loss/20 via-surface/90 to-surface px-3 py-3 sm:gap-4 sm:px-4">
              <Avatar
                name={worst.name}
                src={worst.avatarUrl}
                size="lg"
                className="size-14 shrink-0 rounded-xl border-2 border-loss sm:size-16"
              />
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-bold tracking-[0.25em] text-loss uppercase">Lanterna</div>
                <div className="truncate font-display text-xl font-bold" title={worst.name}>
                  {worst.name}
                </div>
                <div className="text-sm text-muted tabular">
                  {worst.k}K / {worst.a}A / {worst.d}D
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="rounded-full bg-loss/15 px-2.5 py-0.5 text-sm font-bold text-loss tabular">
                  {fmt2(kdrOf(worst))} KDR
                </span>
                <span className="text-xs text-muted tabular">
                  {worst.adr != null ? `${worst.adr.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ADR · ` : ""}
                  {signed(worst.rp)} RP
                </span>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
