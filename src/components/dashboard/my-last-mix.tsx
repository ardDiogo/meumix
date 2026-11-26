import { Crown } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { LastMixSummary } from "@/services/last-mix";
import { cn } from "@/lib/utils";
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

const RESULT = {
  win: { label: "Vitória", box: "border-win/40 from-win/15", pill: "bg-win/15 text-win" },
  loss: { label: "Derrota", box: "border-loss/40 from-loss/15", pill: "bg-loss/15 text-loss" },
  draw: { label: "Empate", box: "border-border-strong from-surface-3/60", pill: "bg-surface-3 text-muted" },
} as const;

/**
 * Topo do Dashboard: o seu último mix, compacto (logo do MeuMix, resultado colorido,
 * o resumo completo do jogador, a resenha da IA e você contra a sua média).
 */
export function MyLastMix({ data, compact = false }: { data: LastMixSummary; compact?: boolean }) {
  const me = data.me!;
  const r = RESULT[me.result];
  const tone = (v: number) => (Math.abs(v) <= 3 ? "text-yellow-400" : v > 0 ? "text-win" : "text-loss");
  const stats: { label: string; value: React.ReactNode; cls?: string }[] = [
    { label: "K/A/D", value: `${me.k}/${me.a}/${me.d}`, cls: "text-sm sm:text-base" },
    { label: "KDR", value: num(me.kdr, 2) },
    { label: "ADR", value: num(me.adr) },
    { label: "FK", value: me.fk },
    { label: "KAST", value: me.kast == null ? "—" : `${Math.round(me.kast)}%` },
    ...(me.hsRate != null ? [{ label: "HS%", value: `${Math.round(me.hsRate)}%` }] : []),
    ...(me.rating != null ? [{ label: "Rating", value: num(me.rating, 2) }] : []),
    { label: "PTS", value: me.pts },
    {
      label: "ELO",
      value: me.eloDelta == null ? "—" : signed(me.eloDelta),
      cls: me.eloDelta == null ? "" : me.eloDelta >= 0 ? "text-win" : "text-loss",
    },
  ];

  return (
    <section
      aria-label="Seu último mix"
      className={cn(
        "relative overflow-hidden border bg-gradient-to-br via-surface to-surface",
        r.box,
        compact ? "mb-4 rounded-xl" : "-mx-4 -mt-6 mb-6 border-x-0 border-t-0 sm:mx-0 sm:mt-0 sm:rounded-xl sm:border",
      )}
    >
      <div className="space-y-3 p-4 sm:p-5">
        {/* Logo, título e quando foi */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <Image src="/brand/logo.png" alt="MeuMix" width={98} height={24} className="h-5 w-auto sm:h-6" />
            <span className="h-4 w-px bg-border-strong" aria-hidden />
            <span className="font-display text-sm font-bold tracking-wide uppercase sm:text-base">Seu último mix</span>
          </div>
          <span className="text-xs text-muted">
            <span className="font-semibold text-fg">{data.name}</span>
            {data.league ? ` · ${data.league}` : ""} · {ago(data.date)}
          </span>
        </div>

        {/* Jogador e resultado */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            {me.isMvp && (
              <Crown
                className="absolute -top-3.5 left-1/2 size-5 -translate-x-1/2 fill-yellow-400 text-yellow-500"
                aria-hidden
              />
            )}
            <Avatar name={me.person.name} src={me.person.avatarUrl} size="md" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="truncate font-display text-lg font-bold">{me.person.name}</span>
              {me.eloAfter != null && <LevelBadge elo={me.eloAfter} />}
              {me.isMvp && <span className="text-[10px] font-bold text-brand uppercase">MVP</span>}
              {me.isLanterna && (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-loss uppercase">
                  <Image src="/badges/lanternavermelha.png" alt="" width={16} height={16} className="size-4" />
                  Lanterna
                </span>
              )}
            </div>
            <div className="text-xs text-muted">
              {me.teamName} · {me.position}º de {me.total} na planilha
              {me.eloAfter != null && ` · ELO ${me.eloAfter}`}
            </div>
          </div>
          <div className={cn("rounded-md px-3 py-1.5 text-center", r.pill)}>
            <div className="text-[10px] font-bold tracking-[0.15em] uppercase">{r.label}</div>
            {me.ownScore && (
              <div className="font-display text-xl leading-none font-bold tabular">
                {me.ownScore[0]} – {me.ownScore[1]}
              </div>
            )}
          </div>
        </div>

        {/* Resumo completo */}
        <dl className="grid grid-cols-3 gap-1.5 sm:grid-cols-5 lg:auto-cols-fr lg:grid-flow-col lg:grid-cols-none">
          {stats.map((s) => (
            <div key={s.label} className="rounded-md border border-border bg-bg/60 px-1.5 py-1.5 text-center">
              <dt className="text-[10px] tracking-wider text-muted uppercase">{s.label}</dt>
              <dd className={cn("font-display text-base font-bold tabular sm:text-lg", s.cls)}>{s.value}</dd>
            </div>
          ))}
        </dl>

        {/* Você contra a sua média (numa linha) */}
        {me.perf ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className="font-semibold text-muted">Contra a sua média:</span>
            <span className={cn("font-display text-sm font-bold", tone(me.perf.value))}>
              {signed(me.perf.value)}% {me.perf.value > 3 ? "🔥" : me.perf.value < -3 ? "🧊" : ""}
            </span>
            {me.perf.parts.map((p) => (
              <span key={p.stat} className="text-muted" title={`${p.now} no mix · média ${p.avg}`}>
                {p.label} <b className={tone(p.pct)}>{signed(p.pct)}%</b>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted">
            🆕 Primeiro mix na liga: a comparação com a sua média vem a partir do próximo.
          </p>
        )}

        {/* Resenha e dica */}
        {(me.roast || me.tip) && (
          <div className="space-y-1">
            {me.roast && (
              <p className="rounded-r-md border-l-2 border-brand bg-bg/60 px-3 py-1.5 text-sm text-orange-300 italic">
                “{me.roast}”
              </p>
            )}
            {me.tip && (
              <p className="text-xs text-muted">
                Dica: <b className="text-fg">{me.tip}</b>
              </p>
            )}
          </div>
        )}

        <div className="text-right">
          <Link href={data.href} className="text-xs font-semibold text-brand hover:text-brand-hover sm:text-sm">
            Ver o mix completo →
          </Link>
        </div>
      </div>
    </section>
  );
}
