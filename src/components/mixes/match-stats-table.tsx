"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import { MapIcon } from "@/components/maps/map-icon";
import type { GcMapStored } from "@/lib/gc-api";
import { aggregateGc, type GcLine } from "@/lib/gc-analysis";
import { mapName } from "@/lib/maps";
import { byMixScore, diffOf, kdrOf, mixScore, type StatRow } from "@/lib/match-highlights";
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
  return `${r.name}: 3 × ${r.k} kills (${n(3 * r.k)}) + 1,5 × ${r.a} assist. (${n(1.5 * r.a)}) + 1,2 × ${r.fk} FK (${n(
    1.2 * r.fk,
  )}) + 0,2 × ${n(adr)} ADR (${n(0.2 * adr)}) − 2 × ${r.d} mortes (${n(2 * r.d)}) = ${n(mixScore(r))}`;
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
      "Pontuação do mix (a mesma do MVP): kills × 3 + assistências × 1,5 + first kills × 1,2 + ADR × 0,2 − mortes × 2",
    value: mixScore,
    render: (r) => (
      <span className="cursor-help font-display font-bold" title={scoreBreakdown(r)}>
        {fmt(mixScore(r), 1)}
      </span>
    ),
  },
  {
    key: "k",
    label: "K",
    title: "Kills",
    value: (r) => r.k,
    render: (r) => (
      <span className="inline-flex min-w-9 justify-center rounded-md border border-win/30 bg-win/10 px-1.5 py-0.5 text-win">
        {r.k}
      </span>
    ),
  },
  { key: "a", label: "A", title: "Assistências", value: (r) => r.a },
  {
    key: "d",
    label: "D",
    title: "Mortes",
    value: (r) => r.d,
    render: (r) => (
      <span className="inline-flex min-w-9 justify-center rounded-md border border-loss/30 bg-loss/10 px-1.5 py-0.5 text-loss">
        {r.d}
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
export function MatchStatsTable({ rows, gcMaps = [] }: { rows: StatRow[]; gcMaps?: GcMapStored[] }) {
  const withGc = gcMaps.length > 0;
  const [tab, setTab] = useState<Tab>("geral");
  const [only, setOnly] = useState<number | null>(null);
  // Jogador com a conta da PTS aberta (toque ou clique na PTS).
  const [open, setOpen] = useState<{ key: string; kind: "pts" | "rp" } | null>(null);
  const spec = TABS.find((t) => t.key === tab)!;
  const hasRpGc = rows.some((r) => r.rpGc != null);
  const cols = useMemo(() => {
    if (tab !== "geral") return spec.cols;
    const base = geralCols(withGc);
    if (!hasRpGc) return base;
    const at = base.findIndex((c) => c.key === "rp") + 1;
    return [...base.slice(0, at), RP_GC, ...base.slice(at)];
  }, [tab, withGc, spec, hasRpGc]);
  // Trocar de aba volta para a ordenação padrão dela.
  const [sort, setSort] = useState<{ key: string; desc: boolean }>({ key: "pts", desc: true });

  // Dados da GC por jogador (pelo ID do MeuMix; convidado, pelo nick). A Geral usa o mix inteiro.
  const lines = useMemo(
    () => (withGc ? aggregateGc(tab === "geral" || only == null ? gcMaps : [gcMaps[only]!]) : []),
    [withGc, gcMaps, tab, only],
  );
  const sorted = useMemo(() => {
    const withLines: Row[] = rows.map((r) => ({
      ...r,
      gc: lines.find((l) => (r.userId ? l.userId === r.userId : l.nick === r.name)),
    }));
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
  }, [rows, lines, cols, sort]);

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
          {/* Um mapa só: nas abas da GC (a Geral é sempre o mix inteiro). */}
          {tab !== "geral" && gcMaps.length > 1 && (
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
        </div>
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
            {sorted.map((r) => (
              <Fragment key={r.key}>
                <tr className="border-b border-border last:border-0 hover:bg-surface-2/50">
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
                    </div>
                  </td>
                  {cols.map((c) => (
                    <td key={c.key} className="px-2 py-2.5 text-center tabular">
                      {c.key === "pts" || (c.key === "rp" && r.rpResult != null) ? (
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
      <p className="border-t border-border px-4 py-3 text-xs text-muted">
        <b className="text-fg">Ordem da planilha:</b> 1º o MVP, último o lanterna; o resto pela maior PTS (3 × K + 1,5 ×
        A + 1,2 × FK + 0,2 × ADR − 2 × D). Se empatar, mais kills fica na frente, depois mais assistências. Toque na PTS
        de um jogador para ver a conta dele; no ELO, a conta do ELO.
      </p>
      <details className="group border-t border-border px-4 py-3 text-xs text-muted">
        <summary className="cursor-pointer font-semibold text-fg select-none">Como a PTS é calculada?</summary>
        <div className="mt-2 space-y-2 leading-relaxed">
          <p className="rounded-md bg-surface-2/60 px-3 py-2 font-display text-sm font-bold text-fg">
            PTS = 3 × K + 1,5 × A + 1,2 × FK + 0,2 × ADR − 2 × D
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <b className="text-fg">Entra na conta:</b> kills (+3 cada), assistências (+1,5 cada), first kills — a
              primeira kill do round (+1,2 cada), ADR (dano médio por round × 0,2) e mortes (−2 cada). Com mais de um
              mapa, K, A, FK e D são somados e o ADR é a média pelos rounds.
            </li>
            <li>
              <b className="text-fg">Não entra:</b> rating e swing da GC, KDR, KAST, HS%, FA, MK e o placar do time. O
              KDR aparece só de forma indireta, pelas kills e pelas mortes.
            </li>
            <li>
              <b className="text-fg">Ordem da tabela:</b> o MVP (maior PTS da partida) vem primeiro, o lanterna por
              último e o resto pela PTS. Se empatar, quem tem mais kills fica na frente, depois mais assistências.
            </li>
            <li>
              <b className="text-fg">Lanterna</b> tem conta própria: o menor valor de kills + ADR ÷ 100 + KDR × 10.
            </li>
            <li>
              A PTS define o MVP e a ordem da tabela e também entra no <b className="text-fg">ELO</b> (veja abaixo).
            </li>
          </ul>
        </div>
      </details>
      <details className="group border-t border-border px-4 py-3 text-xs text-muted">
        <summary className="cursor-pointer font-semibold text-fg select-none">Como o ELO é calculado?</summary>
        <div className="mt-2 space-y-2 leading-relaxed">
          <p className="rounded-md bg-surface-2/60 px-3 py-2 font-display text-sm font-bold text-fg">
            ELO do mix = resultado + desempenho
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <b className="text-fg">Resultado</b> (vitória, empate ou derrota na série, pelos mapas): com times
              parelhos, vitória <b className="text-fg">+20</b>, derrota <b className="text-fg">−20</b> e empate 0. Conta
              a força dos times pelo ELO médio de cada um: ganhar de um time mais forte vale mais (até +40), e perder
              para um mais fraco tira mais (até −40). Conta: 40 × (resultado − chance de vitória).
            </li>
            <li>
              <b className="text-fg">Desempenho</b>: a sua PTS comparada com a média da PTS dos 10 jogadores do mix, de{" "}
              <b className="text-fg">−20 a +20</b>. Conta: 30 × (sua PTS − média) ÷ média. Quem joga acima da média
              ganha mais (ou perde menos); quem joga abaixo, o contrário. Mix sem estatísticas: 0.
            </li>
            <li>
              O ELO de cada liga é separado (Mix da Lanterna e Mix do Jantinha) e começa no ELO inicial do seu nível da
              GC. Fica entre 0 e 1600 e define o seu nível (1 a 10), o ranking e o equilíbrio dos times.
            </li>
            <li>
              O ELO da liga é recalculado do histórico inteiro sempre que um mix é finalizado, excluído ou corrigido.
            </li>
            <li>
              <b className="text-fg">RP GC</b>: o RP que a GC informou, só como informação. Não entra no ELO, porque
              pode vir congelado ou dobrado.
            </li>
            <li>Toque no ELO de um jogador para ver a conta dele.</li>
          </ul>
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
