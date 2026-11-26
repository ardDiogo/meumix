"use client";

import { ChevronLeft, ChevronRight, Crown } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import hero from "../../../public/brand/hero.webp";
import type { LastMixPerson, LastMixSummary } from "@/services/last-mix";
import type { MapId } from "@/types/domain";
import { cn } from "@/lib/utils";
import { MapIcon } from "../maps/map-icon";
import { Avatar } from "../ui/avatar";

const AUTOPLAY_MS = 7000;
const DAY = 86_400_000;

function ago(date: string) {
  const days = Math.round((Date.now() - new Date(`${date}T12:00:00`).getTime()) / DAY);
  return days <= 0 ? "hoje" : days === 1 ? "ontem" : `há ${days} dias`;
}

/** Contorno azul/amarelo pelo time (serve para saber o time no empate). */
const ring = (team: "A" | "B") => (team === "A" ? "ring-2 ring-sky-400" : "ring-2 ring-yellow-400");

function Face({ p, size = "sm" }: { p: LastMixPerson; size?: "xs" | "sm" | "md" | "lg" }) {
  return (
    <span title={p.name} className="shrink-0">
      <Avatar name={p.name} src={p.avatarUrl} size={size} className={ring(p.team)} />
    </span>
  );
}

/** Lanterna (a mesma imagem da insígnia do site). */
function LanternIcon({ className }: { className?: string }) {
  return (
    <Image
      src="/badges/lanternavermelha.png"
      alt=""
      width={20}
      height={20}
      className={cn("size-5 object-contain", className)}
    />
  );
}

/**
 * Carrossel do último mix no topo do Dashboard: série, destaques, resenhas da IA,
 * quem superou a si mesmo e o seu último mix. Troca sozinho a cada 7 s (para ao tocar),
 * arrasta para o lado no celular e tem setas no computador.
 */
export function LastMixCarousel({ data, compact = false }: { data: LastMixSummary; compact?: boolean }) {
  const slides = useMemo(() => {
    const list: { key: string; title: string; body: React.ReactNode }[] = [
      {
        key: "serie",
        title: "Resumo e destaques",
        body: (
          <div className="grid gap-4 lg:grid-cols-[1fr_1.15fr]">
            <SeriesSlide data={data} />
            <HighlightsSlide data={data} />
          </div>
        ),
      },
    ];
    if (data.roasts.length) list.push({ key: "resenhas", title: "Resenhas da IA", body: <RoastsSlide data={data} /> });
    if (data.above.length || data.below.length)
      list.push({ key: "superou", title: "Quem superou a si mesmo", body: <SelfSlide data={data} /> });
    if (data.me) list.push({ key: "voce", title: "Seu último mix", body: <MeSlide data={data} /> });
    return list;
  }, [data]);

  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const go = useCallback(
    (i: number) => {
      const el = track.current;
      if (!el) return;
      const next = (i + slides.length) % slides.length;
      el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
    },
    [slides.length],
  );

  // Slide atual pela rolagem (arrastar no celular também conta).
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const onScroll = () => setIndex(Math.round(el.scrollLeft / Math.max(el.clientWidth, 1)));
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // Troca sozinho (menos com o toque/mouse em cima, aba escondida ou "reduzir movimento").
  useEffect(() => {
    if (paused || slides.length < 2) return;
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => document.visibilityState === "visible" && go(index + 1), AUTOPLAY_MS);
    return () => clearInterval(id);
  }, [paused, index, go, slides.length]);

  return (
    <section
      aria-roledescription="carrossel"
      aria-label={`Último mix: ${data.name}`}
      className={cn(
        "relative overflow-hidden border-border bg-surface",
        compact ? "mb-4 rounded-xl border" : "-mx-4 -mt-6 mb-6 border-b sm:mx-0 sm:mt-0 sm:rounded-xl sm:border",
      )}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
      onFocusCapture={() => setPaused(true)}
    >
      <Image
        src={hero}
        alt=""
        fill
        sizes="(min-width: 1280px) 1232px, 100vw"
        className="object-cover object-[75%_center] opacity-25"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-bg via-bg/85 to-bg/50" aria-hidden />

      <div className="relative px-4 pt-4 sm:px-6 sm:pt-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="text-[11px] font-bold tracking-[0.18em] text-brand uppercase">
            Último mix{data.league ? ` · ${data.league}` : ""}
          </span>
          <span className="text-xs text-muted">
            <span className="font-semibold text-fg">{data.name}</span> · {ago(data.date)}
          </span>
        </div>
      </div>

      <div
        ref={track}
        className="relative flex snap-x snap-mandatory [scrollbar-width:none] overflow-x-auto scroll-smooth [&::-webkit-scrollbar]:hidden"
      >
        {slides.map((s, i) => (
          <div
            key={s.key}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} de ${slides.length}: ${s.title}`}
            className="w-full shrink-0 snap-start px-4 pt-2 pb-3 sm:px-6"
          >
            <h2 className="mb-3 font-display text-lg font-bold tracking-wide uppercase sm:text-xl">{s.title}</h2>
            {s.body}
          </div>
        ))}
      </div>

      <div className="relative flex items-center justify-between gap-2 px-4 pb-4 sm:px-6">
        <div className="flex items-center gap-1.5">
          {slides.length > 1 && (
            <button
              type="button"
              aria-label="Slide anterior"
              onClick={() => go(index - 1)}
              className="mr-1 hidden size-7 items-center justify-center rounded-full border border-border bg-bg/80 text-muted hover:text-fg sm:flex"
            >
              <ChevronLeft className="size-4" />
            </button>
          )}
          {slides.map((s, i) => (
            <button
              key={s.key}
              type="button"
              aria-label={`Ir para: ${s.title}`}
              aria-current={i === index}
              onClick={() => go(i)}
              className={cn("h-2 rounded-full transition-all", i === index ? "w-5 bg-brand" : "w-2 bg-border-strong")}
            />
          ))}
          {slides.length > 1 && (
            <button
              type="button"
              aria-label="Próximo slide"
              onClick={() => go(index + 1)}
              className="ml-1 hidden size-7 items-center justify-center rounded-full border border-border bg-bg/80 text-muted hover:text-fg sm:flex"
            >
              <ChevronRight className="size-4" />
            </button>
          )}
        </div>
        <Link href={data.href} className="text-xs font-semibold text-brand hover:text-brand-hover sm:text-sm">
          Ver o mix completo →
        </Link>
      </div>
    </section>
  );
}

/* --------------------------------- Slides --------------------------------- */

function SeriesSlide({ data }: { data: LastMixSummary }) {
  const [a, b] = data.teams;
  const team = (t: LastMixSummary["teams"][number], right: boolean) => (
    <div className={cn("min-w-0", right && "text-right")}>
      <div
        className={cn(
          "truncate font-display text-sm font-bold uppercase sm:text-base",
          t.side === "A" ? "text-sky-400" : "text-yellow-400",
        )}
      >
        {t.name}
      </div>
      <div className={cn("mt-1.5 flex flex-wrap gap-1", right && "justify-end")}>
        {t.players.map((p) => (
          <Face key={p.name} p={p} size="xs" />
        ))}
      </div>
    </div>
  );
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        {a && team(a, false)}
        <div className="text-center">
          <div className="font-display text-4xl font-bold tabular sm:text-5xl">
            {data.score ? `${data.score[0]} : ${data.score[1]}` : "—"}
          </div>
          <div className="text-[11px] font-semibold tracking-[0.2em] text-muted uppercase">
            {data.winner ? `Vitória ${data.winner === "A" ? a?.name : b?.name}` : "Empate"}
          </div>
        </div>
        {b && team(b, true)}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {data.maps.map((m, i) => (
          <div key={`${m.mapId}-${i}`} className="rounded-md border border-border bg-bg/60 px-3 py-2">
            <div className="flex items-center gap-1.5 text-sm font-semibold">
              <span className="rounded-sm bg-brand px-1 font-display text-[10px] font-bold text-black">{i + 1}</span>
              <MapIcon id={m.mapId as MapId} size={18} />
              {m.name}
            </div>
            <div className="font-display text-xl font-bold tabular">
              <span className="text-sky-400">{m.a ?? "-"}</span> – <span className="text-yellow-400">{m.b ?? "-"}</span>
            </div>
            {m.rounds.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-0.5" aria-hidden>
                {m.rounds.map((w, j) => (
                  <i key={j} className={cn("size-1.5 rounded-[1px]", w === "A" ? "bg-sky-400" : "bg-yellow-400")} />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function HighlightsSlide({ data }: { data: LastMixSummary }) {
  return (
    <div className="grid gap-2">
      {data.mvp && (
        <div className="flex flex-row items-center gap-3 rounded-lg border border-purple-500/40 bg-purple-500/10 p-3 pt-4">
          <div className="relative">
            <Crown
              className="absolute -top-4 left-1/2 size-5 -translate-x-1/2 fill-yellow-400 text-yellow-500"
              aria-hidden
            />
            <Face p={data.mvp} size="lg" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-bold tracking-[0.2em] text-purple-300 uppercase">MVP da partida</div>
            <div className="truncate font-display text-lg font-bold">{data.mvp.name}</div>
            <div className="text-xs text-muted">{data.mvp.line}</div>
            <div className="mt-1 inline-block rounded-full bg-purple-500/20 px-2 py-0.5 text-[11px] font-bold text-purple-200">
              {data.mvp.badge}
            </div>
          </div>
        </div>
      )}
      <div className="grid gap-2">
        <div className="grid grid-cols-2 gap-2">
          {data.highlights.map((h) => (
            <div key={h.label} className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-bg/60 p-2">
              <Face p={h} />
              <div className="min-w-0">
                <div className={cn("text-[10px] font-bold", h.tone)}>{h.label}</div>
                <div className="truncate text-sm font-semibold">{h.name}</div>
                <div className="text-xs text-muted">{h.detail}</div>
              </div>
            </div>
          ))}
        </div>
        {data.lanterna && (
          <div className="flex items-center gap-3 rounded-md border border-loss/40 bg-loss/10 px-3 py-2">
            <Face p={data.lanterna} />
            <div className="min-w-0">
              <div className="flex items-center gap-1 text-[10px] font-bold tracking-[0.15em] text-loss uppercase">
                <LanternIcon className="size-4" /> Lanterna
              </div>
              <div className="truncate font-semibold">{data.lanterna.name}</div>
            </div>
            <div className="ml-auto text-right text-xs text-muted">
              <div className="font-bold text-loss">{data.lanterna.badge}</div>
              {data.lanterna.line}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function RoastsSlide({ data }: { data: LastMixSummary }) {
  // Todos, separados por time: o vencedor primeiro (no empate, a ordem dos times).
  const order = data.winner === "B" ? data.teams.slice().reverse() : data.teams;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {order.map((t) => {
        const list = data.roasts.filter((r) => r.team === t.side);
        if (!list.length) return null;
        const label = data.winner ? (data.winner === t.side ? "Vencedor" : "Derrota") : "Empate";
        return (
          <div key={t.side} className="space-y-1.5">
            <div
              className={cn(
                "flex items-center gap-2 text-[11px] font-bold tracking-[0.15em] uppercase",
                t.side === "A" ? "text-sky-400" : "text-yellow-400",
              )}
            >
              {t.name}
              <span
                className={cn(
                  "rounded-sm px-1.5 py-0.5 text-[9px] tracking-wider",
                  label === "Vencedor"
                    ? "bg-win/15 text-win"
                    : label === "Derrota"
                      ? "bg-loss/15 text-loss"
                      : "bg-surface-3 text-muted",
                )}
              >
                {label}
              </span>
            </div>
            {list.map((r) => (
              <div key={r.name} className="flex gap-2.5 rounded-md border border-border bg-bg/60 px-2.5 py-2">
                <Face p={r} size="xs" />
                <div className="min-w-0">
                  <div className="text-xs font-semibold">{r.name}</div>
                  <p className="text-[12px] leading-snug text-orange-300 italic">“{r.text}”</p>
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function SelfSlide({ data }: { data: LastMixSummary }) {
  const max = Math.max(1, ...[...data.above, ...data.below].map((p) => Math.abs(p.value)));
  const row = (p: LastMixSummary["above"][number], up: boolean) => (
    <div
      key={p.name}
      className="grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded-md border border-border bg-bg/60 px-2.5 py-1.5"
    >
      <Face p={p} size="xs" />
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold">{p.name}</div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3">
          <div
            className={cn("h-full rounded-full", up ? "bg-win" : "bg-loss")}
            style={{ width: `${(Math.abs(p.value) / max) * 100}%` }}
          />
        </div>
      </div>
      <div className={cn("font-display text-sm font-bold tabular", up ? "text-win" : "text-loss")}>
        {up ? "+" : "−"}
        {Math.abs(p.value)}%
      </div>
    </div>
  );
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">
        Cada um comparado com a <b className="text-fg">própria média</b> nos outros mixes (KDR, ADR, FK e KAST).
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <div className="text-[11px] font-bold tracking-[0.15em] text-win uppercase">🔥 Acima do que costuma</div>
          {data.above.map((p) => row(p, true))}
        </div>
        <div className="space-y-1.5">
          <div className="text-[11px] font-bold tracking-[0.15em] text-loss uppercase">🧊 Abaixo do que costuma</div>
          {data.below.map((p) => row(p, false))}
          {data.debuts.length > 0 && (
            <p className="pt-1 text-xs text-muted">
              🆕 <b className="text-fg">{data.debuts.join(", ")}</b> {data.debuts.length > 1 ? "estrearam" : "estreou"}:
              entra na conta a partir do próximo mix.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function MeSlide({ data }: { data: LastMixSummary }) {
  const me = data.me!;
  const stat = (label: string, value: React.ReactNode, tone?: string) => (
    <div className="rounded-md border border-border bg-bg/60 px-2 py-1.5 text-center">
      <div className="text-[10px] tracking-wider text-muted uppercase">{label}</div>
      <div className={cn("font-display text-lg font-bold tabular", tone)}>{value}</div>
    </div>
  );
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="rounded-lg border border-brand/30 bg-brand/5 p-3">
        <div className="flex items-center gap-3">
          <div className="relative">
            {me.isMvp && (
              <Crown
                className="absolute -top-4 left-1/2 size-5 -translate-x-1/2 fill-yellow-400 text-yellow-500"
                aria-hidden
              />
            )}
            <Face p={me.person} size="md" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 font-display text-lg font-bold">
              {me.person.name}
              {me.isMvp && <span className="text-[10px] font-bold text-brand uppercase">MVP</span>}
              {me.isLanterna && (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-loss uppercase">
                  <LanternIcon className="size-4" /> Lanterna
                </span>
              )}
            </div>
            <div className="text-xs text-muted">
              {me.position}º de {me.total} na planilha
            </div>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-2">
          {stat("K/A/D", <span className="text-sm">{`${me.k}/${me.a}/${me.d}`}</span>)}
          {stat("ADR", me.adr != null ? me.adr.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) : "—")}
          {stat("PTS", me.pts)}
          {stat(
            "ELO",
            me.eloDelta != null ? (me.eloDelta > 0 ? `+${me.eloDelta}` : me.eloDelta) : "—",
            me.eloDelta == null ? undefined : me.eloDelta >= 0 ? "text-win" : "text-loss",
          )}
        </div>
      </div>
      <div className="space-y-2">
        {me.roast ? (
          <>
            <div className="text-[11px] font-bold tracking-[0.15em] text-muted uppercase">
              A resenha da IA sobre você
            </div>
            <p className="rounded-r-md border-l-2 border-brand bg-bg/60 px-3 py-2 text-sm text-orange-300 italic">
              “{me.roast}”
            </p>
          </>
        ) : (
          <p className="text-sm text-muted">Sem resenha da IA para você neste mix.</p>
        )}
        {me.tip && (
          <p className="text-xs text-muted">
            Dica: <b className="text-fg">{me.tip}</b>
          </p>
        )}
        {me.eloAfter != null && (
          <p className="text-xs text-muted">
            ELO{data.league ? ` no ${data.league}` : ""}: <b className="text-fg">{me.eloAfter}</b>
          </p>
        )}
      </div>
      <MyPerformance me={me} />
    </div>
  );
}

/** "Quem superou a si mesmo" só do jogador: Geral e cada estatística contra a própria média. */
function MyPerformance({ me }: { me: NonNullable<LastMixSummary["me"]> }) {
  if (!me.perf)
    return (
      <p className="text-xs text-muted md:col-span-2">
        🆕 Primeiro mix na liga: a comparação com a sua média aparece a partir do próximo.
      </p>
    );
  const { value, parts } = me.perf;
  const tone = (v: number) => (Math.abs(v) <= 3 ? "bg-yellow-500" : v > 0 ? "bg-win" : "bg-loss");
  const text = (v: number) => (Math.abs(v) <= 3 ? "text-yellow-400" : v > 0 ? "text-win" : "text-loss");
  const bar = (v: number) => (
    <div className="relative h-2 rounded-full bg-surface-3">
      <span className="absolute top-0 left-1/2 h-full w-px bg-border-strong" aria-hidden />
      <span
        className={cn("absolute top-0 h-full rounded-full", tone(v))}
        style={
          v >= 0
            ? { left: "50%", width: `${Math.min(50, Math.abs(v))}%` }
            : { right: "50%", width: `${Math.min(50, Math.abs(v))}%` }
        }
      />
    </div>
  );
  return (
    <div className="rounded-lg border border-border bg-bg/60 p-3 md:col-span-2">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[11px] font-bold tracking-[0.15em] text-muted uppercase">Você contra a sua média</span>
        <span className={cn("font-display text-lg font-bold tabular", text(value))}>
          {value > 0 ? "+" : value < 0 ? "−" : ""}
          {Math.abs(value)}% {value > 3 ? "🔥" : value < -3 ? "🧊" : ""}
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {parts.map((p) => (
          <div key={p.stat} className="space-y-1">
            <div className="flex items-baseline justify-between text-xs">
              <span className="font-semibold">{p.label}</span>
              <span className={cn("font-bold tabular", text(p.pct))}>
                {p.pct > 0 ? "+" : p.pct < 0 ? "−" : ""}
                {Math.abs(p.pct)}%
              </span>
            </div>
            {bar(p.pct)}
            <div className="text-[11px] text-subtle">
              {p.now} no mix · média {p.avg}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
