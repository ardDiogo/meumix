"use client";

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import { MapIcon } from "@/components/maps/map-icon";
import type { GcMapStored } from "@/lib/gc-api";
import { aggregateGc, roundStory, type GcLine } from "@/lib/gc-analysis";
import { mapName } from "@/lib/maps";
import { cn } from "@/lib/utils";
import type { MapId } from "@/types/domain";
import { Avatar } from "../ui/avatar";
import { TeamDot } from "./badges";

export interface GcPerson {
  name: string;
  avatarUrl: string | null;
  href: string | null;
}

type Tab = "geral" | "entries" | "trades" | "clutch" | "utility" | "aim";

const TABS: { key: Tab; label: string }[] = [
  { key: "geral", label: "Geral" },
  { key: "entries", label: "Entries" },
  { key: "trades", label: "Trades" },
  { key: "clutch", label: "Clutch" },
  { key: "utility", label: "Utilitárias" },
  { key: "aim", label: "Mira" },
];

const fmt = (n: number | null | undefined, digits = 0) =>
  n == null || !Number.isFinite(n)
    ? "-"
    : n.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const pct = (part: number, total: number) => (total ? `${fmt((part / total) * 100)}%` : "-");
const ratio = (won: number, total: number) => (total ? `${won}/${total}` : "-");

type Col = { label: string; title?: string; cell: (l: GcLine) => React.ReactNode };

const ratingTone = (r: number | null) => (r == null ? "" : r >= 1.1 ? "text-win" : r <= 0.9 ? "text-loss" : "text-fg");

const COLS: Record<Tab, Col[]> = {
  geral: [
    {
      label: "GC Rating",
      title: "Rating da GC (média dos mapas, pelos rounds)",
      cell: (l) => (
        <span className={cn("font-display text-base font-bold", ratingTone(l.rating))}>{fmt(l.rating, 2)}</span>
      ),
    },
    {
      label: "Swing",
      title: "Quanto o jogador mudou, em média, a chance de vitória do time por round",
      cell: (l) =>
        l.swing == null ? (
          "-"
        ) : (
          <span className={l.swing > 0 ? "text-win" : l.swing < 0 ? "text-loss" : ""}>
            {l.swing > 0 ? "+" : ""}
            {fmt(l.swing * 100, 1)}%
          </span>
        ),
    },
    { label: "K", cell: (l) => l.k },
    { label: "A", cell: (l) => l.a },
    { label: "D", cell: (l) => l.d },
    {
      label: "DIFF",
      cell: (l) => <span className={l.k - l.d > 0 ? "text-win" : l.k - l.d < 0 ? "text-loss" : ""}>{l.k - l.d}</span>,
    },
    { label: "ADR", cell: (l) => fmt(l.adr, 1) },
    { label: "KAST", cell: (l) => (l.kast == null ? "-" : `${fmt(l.kast)}%`) },
    { label: "HS%", title: "Kills com headshot", cell: (l) => (l.hsRate == null ? "-" : `${fmt(l.hsRate)}%`) },
    {
      label: "3K+",
      title: "Rounds com 3, 4 e 5 kills",
      cell: (l) => {
        const [, , k3 = 0, k4 = 0, k5 = 0] = l.multi;
        return k3 + k4 + k5 ? (
          <span title={`3K: ${k3} · 4K: ${k4} · ACE: ${k5}`}>
            {k3 + k4 + k5}
            {k5 > 0 && <span className="ml-1 text-xs font-bold text-brand">ACE{k5 > 1 ? `×${k5}` : ""}</span>}
          </span>
        ) : (
          "-"
        );
      },
    },
  ],
  entries: [
    { label: "Duelos de abertura", cell: (l) => l.entries.duels },
    { label: "Vencidos", cell: (l) => <span className="text-win">{l.entries.won}</span> },
    { label: "Perdidos", cell: (l) => <span className="text-loss">{l.entries.lost}</span> },
    { label: "Sucesso", cell: (l) => pct(l.entries.won, l.entries.duels) },
    { label: "Aberturas/round", cell: (l) => (l.rounds ? fmt(l.entries.won / l.rounds, 2) : "-") },
  ],
  trades: [
    { label: "Trades feitos", title: "Vingou um companheiro logo depois da morte dele", cell: (l) => l.trades.made },
    { label: "Mortes trocadas", title: "Morreu e foi vingado logo depois", cell: (l) => l.trades.traded },
    { label: "Taxa de troca", title: "Mortes trocadas ÷ mortes", cell: (l) => pct(l.trades.traded, l.d) },
    { label: "Tempo médio", cell: (l) => (l.trades.avgTime == null ? "-" : `${fmt(l.trades.avgTime, 1)}s`) },
  ],
  clutch: [
    { label: "Situações", cell: (l) => l.clutch.situations },
    {
      label: "Vencidos",
      cell: (l) => <span className={l.clutch.won ? "font-semibold text-win" : ""}>{l.clutch.won}</span>,
    },
    { label: "Aproveitamento", cell: (l) => pct(l.clutch.won, l.clutch.situations) },
    { label: "1v1", cell: (l) => ratio(l.clutch.v1Won, l.clutch.v1Total) },
    { label: "1vN", cell: (l) => ratio(l.clutch.vnWon, l.clutch.vnTotal) },
    {
      label: "Maior virada",
      cell: (l) => (l.clutch.biggest ? <span className="font-semibold text-brand">1v{l.clutch.biggest}</span> : "-"),
    },
  ],
  utility: [
    { label: "Dano", title: "Dano com granadas", cell: (l) => l.utility.damage },
    { label: "Inimigos cegados", cell: (l) => l.utility.flashed },
    { label: "Flash assists", cell: (l) => l.fa },
    { label: "Granadas", cell: (l) => l.utility.grenades },
    {
      label: "Dano/granada",
      cell: (l) => (l.utility.grenades ? fmt(l.utility.damage / l.utility.grenades, 1) : "-"),
    },
  ],
  aim: [
    {
      label: "Precisão",
      title: "Tiros que acertaram",
      cell: (l) => (l.aim.accuracy == null ? "-" : `${fmt(l.aim.accuracy)}%`),
    },
    { label: "HS%", title: "Kills com headshot", cell: (l) => (l.hsRate == null ? "-" : `${fmt(l.hsRate)}%`) },
    {
      label: "Head acc.",
      title: "Acertos que foram na cabeça",
      cell: (l) => (l.aim.headAccuracy == null ? "-" : `${fmt(l.aim.headAccuracy)}%`),
    },
    { label: "Abates/round", cell: (l) => (l.rounds ? fmt(l.k / l.rounds, 2) : "-") },
    { label: "Arma principal", cell: (l) => l.aim.mainWeapon ?? "-" },
  ],
};

const REASON: Record<string, string> = {
  elimination: "eliminação",
  bomb_defused: "bomba desarmada",
  bomb_exploded: "bomba explodiu",
  target_bombed: "bomba explodiu",
  time_expired: "tempo esgotado",
  timeout: "tempo esgotado",
};

/** Divisões do placar: meio tempo no 12 e trocas da prorrogação (MR3) a partir do 24. */
const breakAfter = (round: number) => round === 12 || (round >= 24 && (round - 24) % 3 === 0);

/** Placar do ponto de vista de quem venceu: "2×10", "16×14". */
const winnerFirst = (s: { a: number; b: number }, w: "A" | "B") => (w === "A" ? `${s.a}×${s.b}` : `${s.b}×${s.a}`);

/** Placar round a round de um mapa: cada quadrado é um round, na cor de quem venceu. */
function RoundStrip({ map, teams }: { map: GcMapStored; teams: [string, string] }) {
  const story = roundStory(map);
  const name = (t: "A" | "B") => teams[t === "A" ? 0 : 1];
  const final = story.scores.at(-1) ?? { a: map.scoreA, b: map.scoreB };
  return (
    <div className="rounded-lg border border-border bg-surface-2/30 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="flex items-center gap-2 font-semibold">
          <MapIcon id={map.mapId as MapId} size={20} />
          {mapName(map.mapId as MapId)}
        </span>
        <span className="tabular">
          <TeamDot side="A" className="mr-1" />
          {name("A")} <span className="font-display font-bold">{final.a}</span> ×{" "}
          <span className="font-display font-bold">{final.b}</span> {name("B")}
          <TeamDot side="B" className="ml-1" />
        </span>
      </div>
      <div
        className="flex flex-wrap items-center gap-1"
        role="img"
        aria-label={`Rounds de ${mapName(map.mapId as MapId)}`}
      >
        {map.rounds.map((r, i) => {
          const s = story.scores[i]!;
          return (
            <Fragment key={i}>
              <span
                title={`Round ${i + 1}: ${name(r.w)} (${r.ct === r.w ? "CT" : "TR"}) · ${REASON[r.r] ?? r.r} · ${s.a}×${s.b}`}
                className={cn(
                  "flex size-5 items-center justify-center rounded-[3px] text-[9px] font-bold text-black/70",
                  r.w === "A" ? "bg-team-a" : "bg-team-b",
                )}
              >
                {r.r === "bomb_defused" ? "D" : r.r === "bomb_exploded" || r.r === "target_bombed" ? "B" : ""}
              </span>
              {breakAfter(i + 1) && i + 1 < map.rounds.length && <span className="mx-1 h-5 w-px bg-border-strong" />}
            </Fragment>
          );
        })}
      </div>
      {(story.comeback || story.streak) && (
        <ul className="mt-2 space-y-0.5 text-xs text-muted">
          {story.comeback && story.winner && (
            <li>
              🔥 <span className="font-semibold text-fg">Virada:</span> o {name(story.winner)} perdia de{" "}
              {winnerFirst(story.comeback.from, story.winner)} e virou para {winnerFirst(final, story.winner)}.
            </li>
          )}
          {story.streak && story.streak.length >= 4 && (
            <li>
              ⚡ <span className="font-semibold text-fg">Maior sequência:</span> {name(story.streak.team)},{" "}
              {story.streak.length} rounds seguidos (rounds {story.streak.from}–
              {story.streak.from + story.streak.length - 1}).
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

/**
 * Análise da partida com os dados da GC: placar round a round e as abas da GC
 * (Geral, Entries, Trades, Clutch, Utilitárias, Mira), somando os mapas ou
 * um mapa só, separado por time.
 */
export function MatchGcAnalysis({
  maps,
  people,
  teams,
}: {
  maps: GcMapStored[];
  people: Record<string, GcPerson>;
  teams: [string, string];
}) {
  const [tab, setTab] = useState<Tab>("geral");
  const [only, setOnly] = useState<number | null>(null);
  const chosen = useMemo(() => (only == null ? maps : maps.filter((_, i) => i === only)), [maps, only]);
  const lines = useMemo(() => aggregateGc(chosen), [chosen]);
  const person = (l: GcLine): GcPerson =>
    (l.userId && people[l.userId]) || { name: l.nick, avatarUrl: null, href: null };
  const cols = COLS[tab];

  return (
    <div className="space-y-4">
      {maps.length > 1 && (
        <div role="tablist" aria-label="Mapa" className="flex flex-wrap gap-2">
          {[null, ...maps.map((_, i) => i)].map((i) => (
            <button
              key={i ?? "all"}
              type="button"
              role="tab"
              aria-selected={only === i}
              onClick={() => setOnly(i)}
              className={cn(
                "flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm transition-colors",
                only === i
                  ? "border-brand bg-brand/12 font-semibold text-fg"
                  : "border-border text-muted hover:border-border-strong hover:text-fg",
              )}
            >
              {i == null ? (
                "Todos os mapas"
              ) : (
                <>
                  <MapIcon id={maps[i]!.mapId as MapId} size={18} />
                  {mapName(maps[i]!.mapId as MapId)}
                  <span className="text-xs text-subtle tabular">
                    {maps[i]!.scoreA}×{maps[i]!.scoreB}
                  </span>
                </>
              )}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-2">
        {chosen.map((m, i) => (
          <RoundStrip key={`${m.gcMatchId}-${i}`} map={m} teams={teams} />
        ))}
      </div>

      <div
        role="tablist"
        aria-label="Estatística"
        className="inline-flex max-w-full overflow-x-auto rounded-md border border-border bg-surface p-0.5"
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={t.key === tab}
            onClick={() => setTab(t.key)}
            className={cn(
              "flex h-8 items-center rounded-[5px] px-3 text-sm font-medium whitespace-nowrap transition-colors",
              t.key === tab ? "bg-surface-3 text-fg" : "text-muted hover:text-fg",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          {(["A", "B"] as const).map((side) => {
            const rows = lines
              .filter((l) => l.team === side)
              .sort((x, y) => (y.rating ?? 0) - (x.rating ?? 0) || y.k - x.k);
            if (!rows.length) return null;
            return (
              <tbody key={side} className="border-b border-border last:border-0">
                <tr className="text-xs font-semibold text-muted">
                  <th className="px-3 pt-3 pb-2 text-left">
                    <span className="flex items-center gap-2 text-sm text-fg">
                      <TeamDot side={side} /> {teams[side === "A" ? 0 : 1]}
                    </span>
                  </th>
                  {cols.map((c) => (
                    <th key={c.label} className="px-2 pt-3 pb-2 text-center" title={c.title}>
                      {c.label}
                    </th>
                  ))}
                </tr>
                {rows.map((l) => {
                  const p = person(l);
                  return (
                    <tr key={l.key} className="border-t border-border/60 hover:bg-surface-2/50">
                      <td className="px-3 py-2">
                        <span className="flex items-center gap-2 font-semibold">
                          <Avatar name={p.name} src={p.avatarUrl} size="sm" />
                          {p.href ? (
                            <Link href={p.href} className="max-w-44 truncate hover:text-brand">
                              {p.name}
                            </Link>
                          ) : (
                            <span className="max-w-44 truncate" title="Convidado (sem conta)">
                              {p.name}
                            </span>
                          )}
                        </span>
                      </td>
                      {cols.map((c) => (
                        <td key={c.label} className="px-2 py-2 text-center tabular">
                          {c.cell(l)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            );
          })}
        </table>
      </div>
      <p className="text-xs text-subtle">
        Dados da Gamers Club. Com mais de um mapa, contagens são somadas e rating, ADR, KAST e mira são médias pelos
        rounds.
      </p>
    </div>
  );
}
