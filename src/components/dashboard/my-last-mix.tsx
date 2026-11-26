import Image from "next/image";
import { Lantern, LanternCorner } from "@/components/ui/lantern";
import Link from "next/link";
import hero from "../../../public/brand/hero.webp";
import type { LastMixSummary } from "@/services/last-mix";
import type { MapId } from "@/types/domain";
import { cn } from "@/lib/utils";
import { MapIcon } from "../maps/map-icon";
import { LevelBadge } from "../players/level-badge";
import { Avatar } from "../ui/avatar";

const DAY = 86_400_000;
const ago = (date: string) => {
  const days = Math.round((Date.now() - new Date(`${date}T12:00:00`).getTime()) / DAY);
  return days <= 0 ? "hoje" : days === 1 ? "ontem" : `há ${days} dias`;
};
const num = (v: number | null | undefined, d = 1) =>
  v == null ? "—" : v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v)}`;

/** Cor do resultado: borda, brilho no canto e o selo do placar (empate em laranja, não cinza). */
const RESULT = {
  win: { label: "Vitória", border: "border-win/40", glow: "from-win/25", pill: "border-win/40 bg-win/10 text-win" },
  loss: {
    label: "Derrota",
    border: "border-loss/40",
    glow: "from-loss/25",
    pill: "border-loss/40 bg-loss/10 text-loss",
  },
  draw: {
    label: "Empate",
    border: "border-brand/40",
    glow: "from-brand/25",
    pill: "border-brand/40 bg-brand/10 text-brand",
  },
} as const;

/**
 * Topo do Dashboard: o seu último mix (arte de fundo com o brilho da cor
 * do resultado, você em destaque, os mapas, ELO/PTS/K/A/D grandes, a ficha técnica,
 * você contra a sua média e a resenha da IA em balão).
 */
export function MyLastMix({ data, compact = false }: { data: LastMixSummary; compact?: boolean }) {
  const me = data.me!;
  const r = RESULT[me.result];
  const side = me.person.team;
  const teamRing = side === "A" ? "ring-sky-400 shadow-sky-400/40" : "ring-yellow-400 shadow-yellow-400/40";
  const up = (v: number) => (Math.abs(v) <= 3 ? "text-yellow-400" : v > 0 ? "text-win" : "text-loss");
  const eloBefore = me.eloAfter != null && me.eloDelta != null ? me.eloAfter - me.eloDelta : null;
  const tech: [string, string][] = [
    ["KDR", num(me.kdr, 2)],
    ["ADR", num(me.adr)],
    ["FK", String(me.fk)],
    ["KAST", me.kast == null ? "—" : `${Math.round(me.kast)}%`],
    ...(me.hsRate != null ? ([["HS", `${Math.round(me.hsRate)}%`]] as [string, string][]) : []),
    ...(me.rating != null ? ([["Rating", num(me.rating, 2)]] as [string, string][]) : []),
  ];

  return (
    <section
      aria-label="Seu último mix"
      className={cn(
        "relative overflow-hidden border bg-surface",
        r.border,
        compact ? "mb-4 rounded-xl" : "-mx-4 -mt-6 mb-6 border-x-0 border-t-0 sm:mx-0 sm:mt-0 sm:rounded-xl sm:border",
      )}
    >
      <Image
        src={hero}
        alt=""
        fill
        priority={!compact}
        placeholder="blur"
        sizes="(min-width: 1280px) 1232px, 100vw"
        className="object-cover object-[75%_30%] opacity-35"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-bg via-bg/80 to-bg/40" aria-hidden />
      <div className={cn("absolute inset-0 bg-gradient-to-br via-transparent to-transparent", r.glow)} aria-hidden />

      <div className="relative space-y-3 p-4 sm:p-5">
        {/* Logo, título e quando foi */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className="font-display text-sm font-bold tracking-[0.12em] text-brand uppercase">
              Seu último mix
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-xs text-muted">
              <span className="font-semibold text-fg">{data.name}</span>
              {data.league ? ` · ${data.league}` : ""} · {ago(data.date)}
            </span>
            <Link
              href={data.href}
              className="rounded-md border border-brand/50 bg-brand/15 px-2.5 py-1 text-xs font-bold text-brand hover:bg-brand/25"
            >
              Ver o mix completo →
            </Link>
          </div>
        </div>

        {/* Você e o resultado */}
        <div
          className={cn(
            "grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-3 sm:grid-cols-[auto_1fr_auto]",
            me.isMvp && "pt-3",
          )}
        >
          <div className="relative">
            {me.isMvp && (
              <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-2xl" aria-hidden>
                👑
              </span>
            )}
            <Avatar
              name={me.person.name}
              src={me.person.avatarUrl}
              size="xl"
              className={cn("size-16 shadow-lg ring-3 sm:size-20", teamRing)}
            />
            {me.isLanterna && <LanternCorner />}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate font-display text-2xl font-bold sm:text-3xl">{me.person.name}</span>
              {me.eloAfter != null && <LevelBadge elo={me.eloAfter} size="md" />}
              {me.isMvp && (
                <span className="rounded-full border border-brand/40 bg-brand/15 px-2.5 py-0.5 text-xs font-bold text-brand">
                  MVP
                </span>
              )}
              {me.isLanterna && (
                <span className="inline-flex items-center gap-1 rounded-full border border-loss/40 bg-loss/15 px-2.5 py-0.5 text-xs font-bold text-loss">
                  <Lantern className="size-4" glow={false} />
                  LANTERNA
                </span>
              )}
            </div>
            <div className="mt-0.5 text-sm text-muted">
              {me.teamName} ·{" "}
              <b className="text-fg">
                {me.position}º de {me.total}
              </b>{" "}
              na planilha
            </div>
          </div>
          <div
            className={cn(
              "col-span-2 flex items-center justify-between gap-3 rounded-xl border px-4 py-2 sm:col-span-1 sm:block sm:min-w-32 sm:text-center",
              r.pill,
            )}
          >
            <div className="text-[11px] font-extrabold tracking-[0.2em] uppercase">{r.label}</div>
            {me.ownScore && (
              <div className="font-display text-3xl leading-none font-bold text-fg tabular sm:text-4xl">
                {me.ownScore[0]} – {me.ownScore[1]}
              </div>
            )}
          </div>
        </div>

        {/* Mapas, com o seu placar em cada um */}
        {data.maps.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {data.maps.map((m, i) => {
              const own = side === "A" ? [m.a, m.b] : [m.b, m.a];
              const won = own[0] != null && own[1] != null ? own[0] > own[1] : null;
              return (
                <span
                  key={`${m.mapId}-${i}`}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border bg-bg/70 px-2.5 py-1 text-xs",
                    won === true ? "border-win/40" : won === false ? "border-loss/40" : "border-border",
                  )}
                >
                  <MapIcon id={m.mapId as MapId} size={15} />
                  {m.name}
                  <b
                    className={cn("font-display tabular", won === true ? "text-win" : won === false ? "text-loss" : "")}
                  >
                    {own[0] ?? "-"}–{own[1] ?? "-"}
                  </b>
                </span>
              );
            })}
          </div>
        )}

        {/* Os 3 números grandes */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-border bg-bg/70 px-3 py-1.5 sm:px-4">
            <div className="text-[10px] font-bold tracking-[0.14em] text-muted uppercase sm:text-[11px]">K / A / D</div>
            <div className="font-display text-lg leading-tight font-bold tabular sm:text-2xl">
              {me.k}/{me.a}/{me.d}
            </div>
            <div className="text-[11px] text-muted">{num(me.kdr, 2)} KDR</div>
          </div>
          <div className="rounded-lg border border-border bg-bg/70 px-3 py-1.5 sm:px-4">
            <div className="text-[10px] font-bold tracking-[0.14em] text-muted uppercase sm:text-[11px]">PTS</div>
            <div className="font-display text-xl leading-tight font-bold tabular sm:text-2xl">{me.pts}</div>
            <div className="text-[11px] text-muted">pontuação</div>
          </div>
          <div
            className={cn(
              "rounded-lg border bg-bg/70 px-3 py-1.5 sm:px-4",
              me.eloDelta == null
                ? "border-border"
                : me.eloDelta >= 0
                  ? "border-win/40 bg-gradient-to-b from-win/10"
                  : "border-loss/40 bg-gradient-to-b from-loss/10",
            )}
          >
            <div className="text-[10px] font-bold tracking-[0.14em] text-muted uppercase sm:text-[11px]">ELO</div>
            <div
              className={cn(
                "font-display text-xl leading-tight font-bold tabular sm:text-2xl",
                me.eloDelta == null ? "" : me.eloDelta >= 0 ? "text-win" : "text-loss",
              )}
            >
              {me.eloDelta == null ? "—" : signed(me.eloDelta)}
            </div>
            <div className="text-[11px] text-muted">
              {eloBefore != null ? `${eloBefore} → ${me.eloAfter}` : (me.eloAfter ?? "")}
            </div>
          </div>
        </div>

        {/* Ficha técnica com a comparação com a sua média ao lado de cada número */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
          {me.perf && (
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 text-xs font-bold",
                Math.abs(me.perf.value) <= 3
                  ? "border-yellow-500/40 bg-yellow-500/10 text-yellow-400"
                  : me.perf.value > 0
                    ? "border-win/40 bg-win/10 text-win"
                    : "border-loss/40 bg-loss/10 text-loss",
              )}
              title="Média de KDR, ADR, FK e KAST contra a sua média nos outros mixes"
            >
              {me.perf.value > 3 ? "🔥 " : me.perf.value < -3 ? "🧊 " : ""}
              {signed(me.perf.value)}% {me.perf.value >= 0 ? "acima" : "abaixo"} da média
            </span>
          )}
          {tech.map(([label, value]) => {
            const part = me.perf?.parts.find((p) => p.label === label);
            return (
              <span key={label} title={part ? `${part.now} no mix · média ${part.avg}` : undefined}>
                {label} <b className="font-display text-base text-fg tabular">{value}</b>
                {part && (
                  <b className={cn("ml-1 text-xs", up(part.pct))}>
                    {part.pct > 3 ? "▲" : part.pct < -3 ? "▼" : "●"}
                    {Math.abs(part.pct)}%
                  </b>
                )}
              </span>
            );
          })}
        </div>
        {!me.perf && (
          <p className="text-xs text-muted">
            🆕 Primeiro mix na liga: a comparação com a sua média vem a partir do próximo.
          </p>
        )}

        {/* Seu jogo no mix (GC): compacto, uma linha no computador e 2×2 no celular */}
        {me.game && (
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold tracking-[0.14em] text-muted uppercase">
              Seu jogo no mix
              <span className="text-xs font-bold tracking-normal text-orange-300 normal-case">
                {me.game.role.emoji} {me.game.role.label}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-4">
              {me.game.items.map((g) => (
                <div
                  key={g.key}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border bg-bg/70 px-2.5 py-1.5"
                >
                  <div className="min-w-0">
                    <div className="truncate text-[11px] text-muted">
                      {g.emoji} {g.label}
                    </div>
                    <div className="text-sm leading-tight">
                      <b className="font-display tabular">{g.value}</b>{" "}
                      <span className="text-[11px] text-muted">{g.detail}</span>
                    </div>
                  </div>
                  <span
                    title="Posição entre os jogadores do mix"
                    className={cn(
                      "shrink-0 rounded-full px-1.5 py-0.5 font-display text-[11px] font-bold tabular",
                      g.rank <= 3
                        ? "bg-win/15 text-win"
                        : g.rank >= 8
                          ? "bg-loss/15 text-loss"
                          : "bg-yellow-500/15 text-yellow-400",
                    )}
                  >
                    {g.rank}º
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Resenha em balão e dica */}
        {me.roast && (
          <p className="relative rounded-xl border border-brand/30 bg-brand/10 py-2.5 pr-4 pl-11 text-sm leading-snug text-orange-300 italic sm:text-[15px]">
            <span className="absolute top-2.5 left-3.5 text-lg not-italic" aria-hidden>
              🤖
            </span>
            <span className="line-clamp-2 sm:line-clamp-none">“{me.roast}”</span>
          </p>
        )}
        {me.tip && (
          <p className="hidden text-sm text-muted sm:block">
            💡 Dica: <b className="text-fg">{me.tip}</b>
          </p>
        )}
      </div>
    </section>
  );
}
