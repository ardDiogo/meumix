"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import { MapIcon } from "@/components/maps/map-icon";
import type { GcMapStored } from "@/lib/gc-api";
import { aggregateGc, type GcLine } from "@/lib/gc-analysis";
import { mapName } from "@/lib/maps";
import { byMixScore, diffOf, kdrOf, mixScore, type StatRow } from "@/lib/match-highlights";
import { deathSplit, PTS } from "@/lib/match-rules";
import type { MapId } from "@/types/domain";
import { cn } from "@/lib/utils";
import { LevelBadge } from "../players/level-badge";
import { Avatar } from "../ui/avatar";
import { TeamDot } from "./badges";
import { playerSlug } from "@/lib/player-slug";
import { shortNick } from "@/lib/auth/validation";

/** Linha da tabela: a estatística do mix e, se importado da GC, os dados completos. */
type Row = StatRow & { gc?: GcLine };

type Col = {
  key: string;
  label: string;
  title?: string;
  value: (r: Row) => number | null;
  render?: (r: Row) => React.ReactNode;
};

const fmt = (n: number | null, digits = 0) =>
  n == null ? "-" : n.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
/** A conta da PTS do jogador, para o balão ao passar o mouse (ou tocar). */
const scoreBreakdown = (r: StatRow) => {
  const n = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  const adr = r.adr ?? 0;
  const { traded, untraded, known } = deathSplit({ deaths: r.d, tradedDeaths: r.tradedDeaths });
  const deaths = known
    ? `0,5 × ${traded} mortes trocadas (${n(PTS.tradedDeath * traded)}) − 1,5 × ${untraded} não trocadas (${n(
        PTS.death * untraded,
      )})`
    : `1,5 × ${r.d} mortes (${n(PTS.death * r.d)})`;
  return `${r.name}: 3 × ${r.k} kills (${n(PTS.kill * r.k)}) + 1,5 × ${r.a} assist. (${n(PTS.assist * r.a)}) + 2 × ${
    r.fk
  } FK (${n(PTS.firstKill * r.fk)}) + 0,2 × ${n(adr)} ADR (${n(PTS.adr * adr)}) − ${deaths} = ${n(mixScore(r))}`;
};

const dec = (v: number) => {
  const t = Math.abs(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  return `${v < 0 ? "−" : "+"}${t}`;
};

/** A conta do ELO do mix do jogador. */
const rpBreakdown = (r: StatRow) =>
  `${r.name}: resultado ${dec(r.rpResult ?? 0)} (vitória, empate ou derrota × força dos times) + desempenho ${dec(
    r.rpPerf ?? 0,
  )} (PTS ${fmt(mixScore(r), 1)} × média do mix ${fmt(r.ptsAvg ?? null, 1)}) = ${signed(r.rp)}${
    r.rpGc != null ? ` · RP da GC: ${signed(r.rpGc)} (só informação)` : ""
  }`;

const RP_GC: Col = {
  key: "rpgc",
  label: "RP GC",
  title: "RP informado pela GC: só informação, não entra no ELO (pode vir congelado ou dobrado)",
  value: (r) => r.rpGc ?? null,
  render: (r) => <span className="text-subtle">{r.rpGc == null ? "-" : signed(r.rpGc)}</span>,
};

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
const tone = (n: number) => (n > 0 ? "text-win" : n < 0 ? "text-loss" : "text-muted");

const BASE_COLS: Col[] = [
  {
    key: "pts",
    label: "PTS",
    title:
      "Pontuação do mix (a mesma do MVP): kills × 3 + assistências × 1,5 + first kills × 2 + ADR × 0,2 − mortes trocadas × 0,5 − mortes não trocadas × 1,5",
    value: mixScore,
    render: (r) => (
      <span className="cursor-help font-display font-bold" title={scoreBreakdown(r)}>
        {fmt(mixScore(r), 1)}
      </span>
    ),
  },
  {
    key: "k",
    label: "K/A/D",
    title: "Kills / assistências / mortes (ordena por kills)",
    value: (r) => r.k,
    render: (r) => (
      <span className="whitespace-nowrap">
        <b className="font-semibold text-win">{r.k}</b>
        <span className="text-subtle">/</span>
        {r.a}
        <span className="text-subtle">/</span>
        <span className="text-loss">{r.d}</span>
      </span>
    ),
  },
  {
    key: "diff",
    label: "DIFF",
    title: "Kills − mortes",
    value: diffOf,
    render: (r) => <span className={tone(diffOf(r))}>{signed(diffOf(r))}</span>,
  },
  { key: "adr", label: "ADR", title: "Dano médio por round", value: (r) => r.adr, render: (r) => fmt(r.adr, 2) },
  {
    key: "kdr",
    label: "KDR",
    title: "Kills por morte",
    value: kdrOf,
    render: (r) => <span className="font-semibold">{fmt(kdrOf(r), 2)}</span>,
  },
  { key: "kast", label: "KAST", value: (r) => r.kast, render: (r) => (r.kast == null ? "-" : `${fmt(r.kast)}%`) },
  { key: "s", label: "S", value: (r) => r.s, render: (r) => <span className="text-subtle">{r.s || "-"}</span> },
  { key: "fa", label: "FA", title: "Flash assists", value: (r) => r.fa },
  { key: "mk", label: "MK", title: "Multi-kills", value: (r) => r.mk },
  { key: "fk", label: "FK", title: "First kills", value: (r) => r.fk },
  {
    key: "rp",
    label: "ELO",
    title: "ELO ganho ou perdido no mix: resultado × força dos times + desempenho pela PTS",
    value: (r) => r.rp,
    render: (r) => (
      <span className={tone(r.rp)} title={r.rpResult != null ? rpBreakdown(r) : undefined}>
        {signed(r.rp)}
      </span>
    ),
  },
  { key: "drop", label: "DROP", value: (r) => r.drop },
];

const pctOf = (part: number, total: number) => (total ? (part / total) * 100 : null);
const pctText = (n: number | null) => (n == null ? "-" : `${fmt(n)}%`);
const ratingTone = (r: number | null) => (r == null ? "" : r >= 1.1 ? "text-win" : r <= 0.9 ? "text-loss" : "");
/** Coluna que só lê os dados da GC (serve também para a tabela da página Estatísticas). */
export type GcCol = {
  key: string;
  label: string;
  title?: string;
  value: (r: { gc?: GcLine }) => number | null;
  render?: (r: { gc?: GcLine }) => React.ReactNode;
};

/** Coluna da GC: sem dados da GC para o jogador, "-" e vai para o fim na ordenação. */
export const gcCol = (
  key: string,
  label: string,
  value: (g: GcLine) => number | null,
  render?: (g: GcLine) => React.ReactNode,
  title?: string,
): GcCol => ({
  key,
  label,
  title,
  value: (r) => (r.gc ? value(r.gc) : null),
  render: (r) => (r.gc ? render ? render(r.gc) : (value(r.gc) ?? "-") : <span className="text-subtle">-</span>),
});

export const RATING = gcCol(
  "rating",
  "Rating",
  (g) => g.rating,
  (g) => <span className={cn("font-display font-bold", ratingTone(g.rating))}>{fmt(g.rating, 2)}</span>,
  "GC Rating (média dos mapas, pelos rounds)",
);
export const SWING = gcCol(
  "swing",
  "Swing",
  (g) => g.swing,
  (g) =>
    g.swing == null ? (
      "-"
    ) : (
      <span className={tone(g.swing)}>{`${g.swing > 0 ? "+" : ""}${fmt(g.swing * 100, 1)}%`}</span>
    ),
  "Quanto o jogador mudou, em média, a chance de vitória do time por round",
);
export const HS = gcCol(
  "hs",
  "HS%",
  (g) => g.hsRate,
  (g) => pctText(g.hsRate),
  "Kills com headshot",
);

export type Tab = "geral" | "entries" | "trades" | "clutch" | "utility" | "aim";

/** Abas da GC (Entries, Trades, Clutch, Utilitárias, Mira): mix e página Estatísticas. */
export const GC_TABS: { key: Exclude<Tab, "geral">; label: string; sort: string; cols: GcCol[] }[] = [
  {
    key: "entries",
    label: "Entries",
    sort: "won",
    cols: [
      gcCol("duels", "Duelos de abertura", (g) => g.entries.duels),
      gcCol(
        "won",
        "Vencidos",
        (g) => g.entries.won,
        (g) => <span className="text-win">{g.entries.won}</span>,
      ),
      gcCol(
        "lost",
        "Perdidos",
        (g) => g.entries.lost,
        (g) => <span className="text-loss">{g.entries.lost}</span>,
      ),
      gcCol(
        "success",
        "Sucesso",
        (g) => pctOf(g.entries.won, g.entries.duels),
        (g) => pctText(pctOf(g.entries.won, g.entries.duels)),
      ),
      gcCol(
        "per",
        "Aberturas/round",
        (g) => (g.rounds ? g.entries.won / g.rounds : null),
        (g) => (g.rounds ? fmt(g.entries.won / g.rounds, 2) : "-"),
      ),
    ],
  },
  {
    key: "trades",
    label: "Trades",
    sort: "made",
    cols: [
      gcCol(
        "made",
        "Trades feitos",
        (g) => g.trades.made,
        undefined,
        "Vingou um companheiro logo depois da morte dele",
      ),
      gcCol("traded", "Mortes trocadas", (g) => g.trades.traded, undefined, "Morreu e foi vingado logo depois"),
      gcCol(
        "rate",
        "Taxa de troca",
        (g) => pctOf(g.trades.traded, g.d),
        (g) => pctText(pctOf(g.trades.traded, g.d)),
        "Mortes trocadas ÷ mortes",
      ),
      gcCol(
        "time",
        "Tempo médio",
        (g) => g.trades.avgTime,
        (g) => (g.trades.avgTime == null ? "-" : `${fmt(g.trades.avgTime, 1)}s`),
      ),
    ],
  },
  {
    key: "clutch",
    label: "Clutch",
    sort: "cwon",
    cols: [
      gcCol("sit", "Situações", (g) => g.clutch.situations),
      gcCol(
        "cwon",
        "Vencidos",
        (g) => g.clutch.won,
        (g) => <span className={g.clutch.won ? "font-semibold text-win" : ""}>{g.clutch.won}</span>,
      ),
      gcCol(
        "crate",
        "Aproveitamento",
        (g) => pctOf(g.clutch.won, g.clutch.situations),
        (g) => pctText(pctOf(g.clutch.won, g.clutch.situations)),
      ),
      gcCol(
        "v1",
        "1v1",
        (g) => g.clutch.v1Won,
        (g) => (g.clutch.v1Total ? `${g.clutch.v1Won}/${g.clutch.v1Total}` : "-"),
      ),
      gcCol(
        "vn",
        "1vN",
        (g) => g.clutch.vnWon,
        (g) => (g.clutch.vnTotal ? `${g.clutch.vnWon}/${g.clutch.vnTotal}` : "-"),
      ),
      gcCol(
        "big",
        "Maior virada",
        (g) => g.clutch.biggest,
        (g) => (g.clutch.biggest ? <span className="font-semibold text-brand">1v{g.clutch.biggest}</span> : "-"),
      ),
    ],
  },
  {
    key: "utility",
    label: "Utilitárias",
    sort: "dmg",
    cols: [
      gcCol("dmg", "Dano", (g) => g.utility.damage, undefined, "Dano com granadas"),
      gcCol("flashed", "Inimigos cegados", (g) => g.utility.flashed),
      gcCol("gfa", "Flash assists", (g) => g.fa),
      gcCol("nades", "Granadas", (g) => g.utility.grenades),
      gcCol(
        "dpg",
        "Dano/granada",
        (g) => (g.utility.grenades ? g.utility.damage / g.utility.grenades : null),
        (g) => (g.utility.grenades ? fmt(g.utility.damage / g.utility.grenades, 1) : "-"),
      ),
    ],
  },
  {
    key: "aim",
    label: "Mira",
    sort: "acc",
    cols: [
      gcCol(
        "acc",
        "Precisão",
        (g) => g.aim.accuracy,
        (g) => pctText(g.aim.accuracy),
        "Tiros que acertaram",
      ),
      HS,
      gcCol(
        "hacc",
        "Head acc.",
        (g) => g.aim.headAccuracy,
        (g) => pctText(g.aim.headAccuracy),
        "Acertos que foram na cabeça",
      ),
      gcCol(
        "kpr",
        "Abates/round",
        (g) => (g.rounds ? g.k / g.rounds : null),
        (g) => (g.rounds ? fmt(g.k / g.rounds, 2) : "-"),
      ),
      { key: "weapon", label: "Arma principal", value: () => null, render: (r) => r.gc?.aim.mainWeapon ?? "-" },
    ],
  },
];

/** Abas como as da GC; fora a Geral, só existem com os dados importados da GC. */
const TABS: { key: Tab; label: string; sort: string; cols: Col[] }[] = [
  { key: "geral", label: "Geral", sort: "pts", cols: [] },
  ...GC_TABS,
];

/** Aba Geral: as colunas de sempre; com os dados da GC, ganha Rating, Swing e HS%. */
function geralCols(withGc: boolean) {
  if (!withGc) return BASE_COLS;
  const at = BASE_COLS.findIndex((c) => c.key === "kast") + 1;
  return [RATING, SWING, ...BASE_COLS.slice(0, at), HS, ...BASE_COLS.slice(at)];
}

/**
 * Tabela "Estatísticas dos jogadores" do resultado do mix, ordenável por coluna.
 * Mix importado da GC: abas da GC (Geral, Entries, Trades, Clutch,
 * Utilitárias, Mira) e escolha do mapa (o placar round a round fica no placar do topo).
 */
/** Colunas que somem quando ninguém tem o dado (ex.: S e DROP, que a GC não informa). */
const HIDE_IF_EMPTY = ["s", "drop", "fa", "mk", "rpgc"];
/** Num mapa só não existe ELO (ele é do mix inteiro). */
const MIX_ONLY = ["rp", "rpgc", "drop", "s"];

export function MatchStatsTable({
  rows,
  gcMaps = [],
  viewerId,
  teamNames,
}: {
  rows: StatRow[];
  gcMaps?: GcMapStored[];
  viewerId?: string | null;
  teamNames?: [string, string];
}) {
  const [byTeam, setByTeam] = useState(false);
  const withGc = gcMaps.length > 0;
  const [tab, setTab] = useState<Tab>("geral");
  const [only, setOnly] = useState<number | null>(null);
  // Jogador com a conta da PTS aberta (toque ou clique na PTS).
  const [open, setOpen] = useState<{ key: string; kind: "pts" | "rp" } | null>(null);
  const spec = TABS.find((t) => t.key === tab)!;
  const hasRpGc = rows.some((r) => r.rpGc != null);
  const perMap = tab === "geral" && only != null;
  const cols = useMemo(() => {
    if (tab !== "geral") return spec.cols;
    let base = geralCols(withGc);
    if (hasRpGc) {
      const at = base.findIndex((c) => c.key === "rp") + 1;
      base = [...base.slice(0, at), RP_GC, ...base.slice(at)];
    }
    if (perMap) base = base.filter((c) => !MIX_ONLY.includes(c.key));
    return base.filter(
      (c) => !HIDE_IF_EMPTY.includes(c.key) || rows.some((r) => ((c.value(r as Row) as number | null) ?? 0) !== 0),
    );
  }, [tab, withGc, spec, hasRpGc, perMap, rows]);
  // Trocar de aba volta para a ordenação padrão dela.
  const [sort, setSort] = useState<{ key: string; desc: boolean }>({ key: "pts", desc: true });

  // Dados da GC por jogador (pelo ID do MeuMix; convidado, pelo nick). A Geral usa o mix inteiro.
  const lines = useMemo(
    () => (withGc ? aggregateGc(only == null ? gcMaps : [gcMaps[only]!]) : []),
    [withGc, gcMaps, only],
  );
  const sorted = useMemo(() => {
    const withLines: Row[] = rows.map((r) => {
      const gc = lines.find((l) => (r.userId ? l.userId === r.userId : l.nick === r.name));
      // Geral num mapa só: os números do mapa (da GC) no lugar dos totais do mix.
      if (perMap && gc)
        return {
          ...r,
          gc,
          k: gc.k,
          a: gc.a,
          d: gc.d,
          adr: gc.adr,
          kast: gc.kast,
          fa: gc.fa,
          fk: gc.entries.won,
          mk: gc.multi.slice(1).reduce((x, y) => x + y, 0),
          tradedDeaths: gc.trades.traded,
        };
      return { ...r, gc };
    });
    // Padrão (PTS): MVP primeiro, lanterna por último, o resto pela pontuação do mix.
    if (sort.key === "pts") return withLines.sort((x, y) => (sort.desc ? byMixScore(x, y) : byMixScore(y, x)));
    const col = cols.find((c) => c.key === sort.key) ?? cols[0]!;
    return withLines.sort((x, y) => {
      const a = col.value(x);
      const b = col.value(y);
      // Sem valor (ex.: sem dados da GC) vai sempre para o fim.
      if (a == null || b == null) return (a == null ? 1 : 0) - (b == null ? 1 : 0) || byMixScore(x, y);
      // Empate: a ordem padrão (pontuação do mix).
      return (sort.desc ? b - a : a - b) || byMixScore(x, y);
    });
  }, [rows, lines, cols, sort, perMap]);
  // Agrupado por time: o time A e depois o B, cada um na ordem escolhida.
  const shown = byTeam ? [...sorted.filter((r) => r.team === "A"), ...sorted.filter((r) => r.team === "B")] : sorted;

  return (
    <div>
      {withGc && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
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
                onClick={() => {
                  setTab(t.key);
                  setSort({ key: t.sort, desc: true });
                }}
                className={cn(
                  "flex h-8 items-center rounded-[5px] px-3 text-sm font-medium whitespace-nowrap transition-colors",
                  t.key === tab ? "bg-surface-3 text-fg" : "text-muted hover:text-fg",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          {/* Um mapa só (na Geral, o ELO some: ele é do mix inteiro). */}
          {gcMaps.length > 1 && (
            <div role="tablist" aria-label="Mapa" className="flex flex-wrap gap-1.5">
              {[null, ...gcMaps.map((_, i) => i)].map((i) => (
                <button
                  key={i ?? "all"}
                  type="button"
                  role="tab"
                  aria-selected={only === i}
                  onClick={() => setOnly(i)}
                  className={cn(
                    "flex h-8 items-center gap-1.5 rounded-md border px-2 text-xs transition-colors",
                    only === i
                      ? "border-brand bg-brand/12 font-semibold text-fg"
                      : "border-border text-muted hover:border-border-strong hover:text-fg",
                  )}
                >
                  {i == null ? (
                    "Todos os mapas"
                  ) : (
                    <>
                      <MapIcon id={gcMaps[i]!.mapId as MapId} size={16} />
                      {mapName(gcMaps[i]!.mapId as MapId)}
                    </>
                  )}
                </button>
              ))}
            </div>
          )}
          <label className="ml-auto flex cursor-pointer items-center gap-2 text-xs text-muted">
            <input
              type="checkbox"
              className="accent-brand"
              checked={byTeam}
              onChange={(e) => setByTeam(e.target.checked)}
            />
            Agrupar por time
          </label>
        </div>
      )}
      {perMap && (
        <p className="border-b border-border bg-surface-2/40 px-4 py-2 text-xs text-muted">
          Números de {mapName(gcMaps[only!]!.mapId as MapId)} (dados da GC). O ELO é do mix inteiro: volte para “Todos
          os mapas” para ver.
        </p>
      )}
      <div className="overflow-x-auto">
        <table className={cn("w-full text-sm", tab === "geral" ? "min-w-[860px]" : "min-w-[640px]")}>
          <thead>
            <tr className="border-b border-border text-xs font-semibold text-muted">
              <th className="px-4 py-3 text-left">Jogador</th>
              {cols.map((c) => {
                const active = sort.key === c.key;
                return (
                  <th key={c.key} className="px-2 py-3 text-center" title={c.title}>
                    <button
                      type="button"
                      onClick={() => setSort({ key: c.key, desc: sort.key === c.key ? !sort.desc : true })}
                      className={cn("inline-flex items-center gap-0.5 hover:text-fg", active && "text-fg")}
                    >
                      {c.label}
                      {active &&
                        (sort.desc ? <ArrowDown className="size-3" aria-hidden /> : <ArrowUp className="size-3" />)}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <Fragment key={r.key}>
                {byTeam && (i === 0 || shown[i - 1]!.team !== r.team) && (
                  <tr className="border-b border-border bg-surface-2/60">
                    <td colSpan={cols.length + 1} className="px-4 py-1.5 text-xs font-bold tracking-wider uppercase">
                      <span className="flex items-center gap-2">
                        <TeamDot side={r.team} />
                        {teamNames?.[r.team === "A" ? 0 : 1] ?? `Time ${r.team}`}
                      </span>
                    </td>
                  </tr>
                )}
                <tr
                  className={cn(
                    "border-b border-border last:border-0 hover:bg-surface-2/50",
                    !!viewerId && r.userId === viewerId && "bg-brand/8 hover:bg-brand/12",
                  )}
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2 font-semibold">
                      <TeamDot side={r.team} />
                      <Avatar name={r.name} src={r.avatarUrl} size="sm" />
                      {r.userId ? (
                        <Link
                          href={r.profileNick ? `/jogadores/${playerSlug(r.profileNick)}` : `/jogadores/${r.userId}`}
                          className="max-w-44 truncate hover:text-brand"
                          title={r.name}
                        >
                          {shortNick(r.name)}
                        </Link>
                      ) : (
                        <span className="max-w-44 truncate" title={`${r.name} · convidado (sem conta)`}>
                          {shortNick(r.name)}
                        </span>
                      )}
                      {r.elo != null && <LevelBadge elo={r.elo} />}
                      {!!viewerId && r.userId === viewerId && (
                        <span className="rounded bg-brand/15 px-1 text-[10px] font-bold text-brand uppercase">
                          você
                        </span>
                      )}
                    </div>
                  </td>
                  {cols.map((c) => (
                    <td key={c.key} className="px-2 py-2.5 text-center tabular">
                      {(c.key === "pts" && !perMap) || (c.key === "rp" && r.rpResult != null) ? (
                        <button
                          type="button"
                          aria-expanded={open?.key === r.key && open.kind === c.key}
                          aria-label={`Ver a conta ${c.key === "pts" ? "da PTS" : "do ELO"} de ${r.name}`}
                          onClick={() =>
                            setOpen(
                              open?.key === r.key && open.kind === c.key
                                ? null
                                : { key: r.key, kind: c.key as "pts" | "rp" },
                            )
                          }
                          className="rounded-sm underline decoration-dotted underline-offset-4 hover:text-brand"
                        >
                          {c.render ? c.render(r) : c.value(r)}
                        </button>
                      ) : c.render ? (
                        c.render(r)
                      ) : (
                        c.value(r)
                      )}
                    </td>
                  ))}
                </tr>
                {open?.key === r.key && (
                  <tr className="border-b border-border bg-surface-2/40">
                    <td colSpan={cols.length + 1} className="px-4 py-2 text-xs text-muted">
                      <span className="font-semibold text-fg">
                        {open.kind === "pts" ? "Conta da PTS · " : "Conta do ELO · "}
                      </span>
                      {open.kind === "pts" ? scoreBreakdown(r) : rpBreakdown(r)}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-border px-4 py-2.5 text-xs text-muted">
        Ordem padrão: o MVP primeiro, o lanterna por último, o resto pela PTS. Toque na PTS ou no ELO de um jogador para
        ver a conta.
      </p>
      <details className="group border-t border-border px-4 py-3 text-xs text-muted">
        <summary className="cursor-pointer font-semibold text-fg select-none">Como a PTS é calculada?</summary>
        <div className="mt-2 space-y-2 leading-relaxed">
          <p className="rounded-md bg-surface-2/60 px-3 py-2 font-display text-sm font-bold text-fg">
            PTS = 3 × K + 1,5 × A + 2 × FK + 0,2 × ADR − 0,5 × morte trocada − 1,5 × morte não trocada
          </p>
          <p>
            Ganha mix quem joga junto. A PTS valoriza quem cria impacto no round e ajuda o time, e não só quem acumula
            kill sem contexto.
          </p>
          <div>
            <div className="mb-1 font-semibold text-win">Ganha pontos</div>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <b className="text-fg">Kill (K):</b> <b className="text-win">+3</b> por abate.
              </li>
              <li>
                <b className="text-fg">Primeira kill do round (FK):</b> <b className="text-win">+2</b> extras, porque
                abrir vantagem no round é o mais difícil.
              </li>
              <li>
                <b className="text-fg">Assistência (A):</b> <b className="text-win">+1,5</b>, porque ajudar o colega a
                finalizar também conta.
              </li>
              <li>
                <b className="text-fg">Dano (ADR):</b> <b className="text-win">× 0,2</b>, para recompensar quem tira
                vida do inimigo mesmo sem levar a última bala.
              </li>
            </ul>
          </div>
          <div>
            <div className="mb-1 font-semibold text-loss">Perde pontos</div>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <b className="text-fg">Morte trocada:</b> <b className="text-loss">−0,5</b>. Você morreu, mas o time
                vingou na hora: sua morte abriu espaço ou entregou a info.
              </li>
              <li>
                <b className="text-fg">Morte não trocada:</b> <b className="text-loss">−1,5</b>. Você morreu sozinho,
                sem resposta do time, e o time só perdeu um jogador.
              </li>
            </ul>
          </div>
          <p className="rounded-md border border-brand/30 bg-brand/5 px-3 py-2">
            <b className="text-fg">Resumindo:</b> quem joga junto perde pouco quando morre. Quem fica para trás
            esperando (<i>baiter</i>) não abre round e, quando morre, costuma morrer sozinho, então perde mais.
          </p>
          <p className="text-subtle italic">
            Em séries com mais de um mapa, kills, assistências, FK e mortes são somados, e o ADR é a média da série. Sem
            dados de trade no mix, toda morte conta −1,5.
          </p>
          <details className="rounded-md border border-border px-3 py-2">
            <summary className="cursor-pointer font-semibold text-fg select-none">Mais detalhes</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                <b className="text-fg">Não entra na conta:</b> rating e swing da GC, KDR, KAST, HS%, FA, MK e o placar
                do time. O KDR aparece só de forma indireta, por kills e mortes. Isso mantém a conta igual para todos os
                mixes (nem todo mix tem os dados da GC) e evita contar a mesma coisa duas vezes.
              </li>
              <li>
                <b className="text-fg">Ordem da tabela:</b> maior PTS em 1º (MVP), lanterna sempre por último, o resto
                pela PTS.
              </li>
              <li>
                <b className="text-fg">Desempate:</b> mais kills e, se empatar, mais assistências.
              </li>
              <li>
                <b className="text-fg">Lanterna:</b> o menor valor de Kills + (ADR ÷ 100) + (KDR × 10).
              </li>
            </ul>
          </details>
        </div>
      </details>
      <details className="group border-t border-border px-4 py-3 text-xs text-muted">
        <summary className="cursor-pointer font-semibold text-fg select-none">Como o ELO é calculado?</summary>
        <div className="mt-2 space-y-2 leading-relaxed">
          <p className="rounded-md bg-surface-2/60 px-3 py-2 font-display text-sm font-bold text-fg">
            ELO do mix = resultado + desempenho{" "}
            <span className="font-sans text-xs font-normal text-muted">(de −60 a +60 por mix)</span>
          </p>
          <p>
            O ELO mede duas coisas: <b className="text-fg">se o seu time ganhou</b> e{" "}
            <b className="text-fg">o quanto você jogou</b>. Ganhar pesa mais, mas o seu jogo muda o quanto você sobe ou
            cai.
          </p>
          <div>
            <div className="mb-1 font-semibold text-fg">Resultado: −40 a +40</div>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                Com times parelhos: <b className="text-win">vitória +20</b>, <b className="text-loss">derrota −20</b>,{" "}
                <b className="text-fg">empate 0</b>.
              </li>
              <li>
                Com times desiguais (pelo ELO médio de cada um): <b className="text-fg">ganhar de um time mais forte</b>{" "}
                vale mais (até +40), e ganhar sendo o favorito vale menos;{" "}
                <b className="text-fg">perder para um time mais fraco</b> tira mais (até −40);{" "}
                <b className="text-fg">empatar com um time mais forte</b> dá pontos, e empatar sendo o favorito tira.
              </li>
            </ul>
            <p className="mt-1 text-subtle italic">
              Por quê? Vencer quando ninguém esperava merece mais do que vencer quando já era o favorito.
            </p>
          </div>
          <div>
            <div className="mb-1 font-semibold text-fg">Desempenho: −20 a +20</div>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                É <b className="text-fg">calculado pela sua PTS</b>, comparada com a{" "}
                <b className="text-fg">média da PTS dos 10 jogadores</b> do mix: quanto mais acima da média, mais
                pontos; quanto mais abaixo, mais perde. <b className="text-fg">±20 é só o limite</b>, a conta nunca
                passa disso.
              </li>
              <li>
                Ex.: média do mix 150. Sua PTS 180 (20% acima) dá <b className="text-win">+6</b>; 200 (33% acima),{" "}
                <b className="text-win">+10</b>; 250 ou mais, <b className="text-win">+20</b>. Sua PTS 120 (20% abaixo)
                dá <b className="text-loss">−6</b>.
              </li>
              <li>
                Acima da média, você ganha mais numa vitória (ou perde menos numa derrota). Abaixo, o contrário: ganha
                menos numa vitória e perde mais numa derrota.
              </li>
            </ul>
            <p className="mt-1 text-subtle italic">
              Por quê? Para o ELO não depender só do time em que você caiu. Quem carrega numa derrota pode até não
              perder nada.
            </p>
          </div>
          <div>
            <div className="mb-1 font-semibold text-fg">Exemplos (times parelhos)</div>
            <table className="w-full max-w-md overflow-hidden rounded-md border border-border text-center tabular">
              <thead className="bg-surface-2/60 text-[11px] text-muted">
                <tr>
                  <th className="px-2 py-1.5" />
                  <th className="px-2 py-1.5">Jogou 20% acima da média</th>
                  <th className="px-2 py-1.5">Jogou 20% abaixo da média</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-border">
                  <th className="px-2 py-1.5 text-left font-semibold text-win">Venceu</th>
                  <td className="px-2 py-1.5">
                    +20 + 6 = <b className="text-win">+26</b>
                  </td>
                  <td className="px-2 py-1.5">
                    +20 − 6 = <b className="text-win">+14</b>
                  </td>
                </tr>
                <tr className="border-t border-border">
                  <th className="px-2 py-1.5 text-left font-semibold text-loss">Perdeu</th>
                  <td className="px-2 py-1.5">
                    −20 + 6 = <b className="text-loss">−14</b>
                  </td>
                  <td className="px-2 py-1.5">
                    −20 − 6 = <b className="text-loss">−26</b>
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="mt-1">
              Jogou muito acima da média (desempenho no máximo, +20) e perdeu? <b className="text-fg">−20 + 20 = 0</b>.
            </p>
          </div>
          <p className="rounded-md border border-brand/30 bg-brand/5 px-3 py-2">
            <b className="text-fg">Resumindo:</b> vencer é o que mais pesa, mas o seu jogo faz diferença nos dois
            sentidos.
          </p>
          <details className="rounded-md border border-border px-3 py-2">
            <summary className="cursor-pointer font-semibold text-fg select-none">Mais detalhes</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                <b className="text-fg">Contas exatas:</b> resultado = 40 × (resultado − chance de vitória), em que
                vitória vale 1, empate 0,5 e derrota 0; desempenho = 30 × (sua PTS − média) ÷ média.
              </li>
              <li>
                <b className="text-fg">Cada liga tem o seu ELO</b> (Mix da Lanterna e Mix do Jantinha). Ele começa no
                ELO inicial do seu nível da GC e fica entre 0 e 1600. Define o seu nível (1 a 10), o ranking e o
                equilíbrio dos times.
              </li>
              <li>
                <b className="text-fg">O ELO é refeito do histórico inteiro</b> sempre que um mix é finalizado, excluído
                ou corrigido.
              </li>
              <li>
                <b className="text-fg">RP GC:</b> o RP que a GC informou, só como informação. Não entra no ELO, porque
                pode vir congelado ou dobrado.
              </li>
            </ul>
          </details>
        </div>
      </details>
      {withGc && (
        <p className="border-t border-border px-4 py-3 text-xs text-subtle">
          Dados da Gamers Club. Com mais de um mapa, contagens são somadas e rating, ADR, KAST e mira são médias pelos
          rounds.
        </p>
      )}
    </div>
  );
}
