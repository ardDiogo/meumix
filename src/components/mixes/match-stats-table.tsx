"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
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
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
const tone = (n: number) => (n > 0 ? "text-win" : n < 0 ? "text-loss" : "text-muted");

const BASE_COLS: Col[] = [
  {
    key: "pts",
    label: "PTS",
    title: "Pontuação do mix (a mesma do MVP): kills × 3 + assistências × 1,5 + ADR × 0,2 − mortes × 2",
    value: mixScore,
    render: (r) => <span className="font-display font-bold">{fmt(mixScore(r), 1)}</span>,
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
    label: "RP",
    title: "Pontos de ranking (somados ao ELO)",
    value: (r) => r.rp,
    render: (r) => <span className={tone(r.rp)}>{signed(r.rp)}</span>,
  },
  { key: "drop", label: "DROP", value: (r) => r.drop },
];

const pctOf = (part: number, total: number) => (total ? (part / total) * 100 : null);
const pctText = (n: number | null) => (n == null ? "-" : `${fmt(n)}%`);
const ratingTone = (r: number | null) => (r == null ? "" : r >= 1.1 ? "text-win" : r <= 0.9 ? "text-loss" : "");
/** Coluna da GC: sem dados da GC para o jogador, "-" e vai para o fim na ordenação. */
const gcCol = (
  key: string,
  label: string,
  value: (g: GcLine) => number | null,
  render?: (g: GcLine) => React.ReactNode,
  title?: string,
): Col => ({
  key,
  label,
  title,
  value: (r) => (r.gc ? value(r.gc) : null),
  render: (r) => (r.gc ? render ? render(r.gc) : (value(r.gc) ?? "-") : <span className="text-subtle">-</span>),
});

const RATING = gcCol(
  "rating",
  "Rating",
  (g) => g.rating,
  (g) => <span className={cn("font-display font-bold", ratingTone(g.rating))}>{fmt(g.rating, 2)}</span>,
  "GC Rating (média dos mapas, pelos rounds)",
);
const SWING = gcCol(
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
const HS = gcCol(
  "hs",
  "HS%",
  (g) => g.hsRate,
  (g) => pctText(g.hsRate),
  "Kills com headshot",
);

type Tab = "geral" | "entries" | "trades" | "clutch" | "utility" | "aim";

/** Abas como as da GC; fora a Geral, só existem com os dados importados da GC. */
const TABS: { key: Tab; label: string; sort: string; cols: Col[] }[] = [
  { key: "geral", label: "Geral", sort: "pts", cols: [] },
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
  const spec = TABS.find((t) => t.key === tab)!;
  const cols = useMemo(() => (tab === "geral" ? geralCols(withGc) : spec.cols), [tab, withGc, spec]);
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
              <tr key={r.key} className="border-b border-border last:border-0 hover:bg-surface-2/50">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2 font-semibold">
                    <TeamDot side={r.team} />
                    <Avatar name={r.name} src={r.avatarUrl} size="sm" />
                    {r.userId ? (
                      <Link
                        href={r.profileNick ? `/jogadores/${playerSlug(r.profileNick)}` : `/jogadores/${r.userId}`}
                        className="max-w-44 truncate hover:text-brand"
                      >
                        {r.name}
                      </Link>
                    ) : (
                      <span className="max-w-44 truncate" title="Convidado (sem conta)">
                        {r.name}
                      </span>
                    )}
                    {r.elo != null && <LevelBadge elo={r.elo} />}
                  </div>
                </td>
                {cols.map((c) => (
                  <td key={c.key} className="px-2 py-2.5 text-center tabular">
                    {c.render ? c.render(r) : c.value(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {withGc && (
        <p className="border-t border-border px-4 py-3 text-xs text-subtle">
          Dados da Gamers Club. Com mais de um mapa, contagens são somadas e rating, ADR, KAST e mira são médias pelos
          rounds.
        </p>
      )}
    </div>
  );
}
