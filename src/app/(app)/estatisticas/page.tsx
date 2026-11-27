import type { Metadata } from "next";
import { DemoBadge } from "@/components/demo-notice";
import { PageHeader } from "@/components/page-header";
import { PlayerLink } from "@/components/players/player-link";
import { MapWinners } from "@/components/stats/map-winners";
import { StatCard } from "@/components/stats/stat-card";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDecimal, formatInt, formatPercent } from "@/lib/format";
import { mapName } from "@/lib/maps";
import type { Player } from "@/types/domain";
import type { PlayerAggregate } from "@/types/views";
import { getCommunityStats, parsePeriod, RANKING_PERIODS } from "@/services/queries";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { getSession } from "@/services/auth";
import { cn } from "@/lib/utils";
import { MapIcon } from "@/components/maps/map-icon";
import type { GcLine } from "@/lib/gc-analysis";
import { getGcStats } from "@/services/gc-maps";

export const metadata: Metadata = { title: "Estatísticas" };

type Leader = { player: Player; stats: PlayerAggregate };

const pct = (part: number, total: number) => (total ? (part / total) * 100 : null);

/** Líderes com os dados da GC (soma de todos os mapas importados). */
type GcBoard = {
  title: string;
  value: (g: GcLine) => number | null;
  format: (n: number) => string;
  /** Soma (entra no "por mapa"). */
  total?: boolean;
};

/** Líderes da GC agrupados por tema. */
const GC_GROUPS: { title: string; boards: GcBoard[] }[] = [
  {
    title: "Impacto",
    boards: [
      { title: "Maior rating", value: (g) => g.rating, format: (n) => formatDecimal(n) },
      {
        title: "Maior swing",
        value: (g) => (g.swing == null ? null : g.swing * 100),
        format: (n) => `${n > 0 ? "+" : ""}${formatDecimal(n, 1)}%`,
      },
      { title: "Abates por round", value: (g) => (g.rounds ? g.k / g.rounds : null), format: (n) => formatDecimal(n) },
      { title: "Mais clutches vencidos", value: (g) => g.clutch.won, format: (n) => formatInt(n), total: true },
    ],
  },
  {
    title: "Abertura e trade",
    boards: [
      { title: "Mais aberturas vencidas", value: (g) => g.entries.won, format: (n) => formatInt(n), total: true },
      {
        title: "Sucesso na abertura",
        // Com poucos duelos a porcentagem engana: mínimo de 10.
        value: (g) => (g.entries.duels >= 10 ? pct(g.entries.won, g.entries.duels) : null),
        format: (n) => formatPercent(n),
      },
      { title: "Mais trades", value: (g) => g.trades.made, format: (n) => formatInt(n), total: true },
    ],
  },
  {
    title: "Utilitária",
    boards: [
      { title: "Mais dano com granada", value: (g) => g.utility.damage, format: (n) => formatInt(n), total: true },
      { title: "Mais inimigos cegados", value: (g) => g.utility.flashed, format: (n) => formatInt(n), total: true },
      { title: "Mais flash assists", value: (g) => g.fa, format: (n) => formatInt(n), total: true },
      { title: "Mais granadas", value: (g) => g.utility.grenades, format: (n) => formatInt(n), total: true },
    ],
  },
  {
    title: "Mira",
    boards: [
      { title: "Maior precisão", value: (g) => g.aim.accuracy, format: (n) => formatPercent(n) },
      { title: "Maior HS%", value: (g) => g.hsRate, format: (n) => formatPercent(n) },
      { title: "Maior head acc.", value: (g) => g.aim.headAccuracy, format: (n) => formatPercent(n) },
    ],
  },
];

type Board = {
  title: string;
  value: (s: PlayerAggregate) => number | null;
  format: (n: number) => string;
  /** Texto ao lado do número (ex.: "de 20 mixes"). */
  detail?: (s: PlayerAggregate) => string;
  /** Desempate (maior primeiro). */
  tie?: (s: PlayerAggregate) => number;
  /** Soma (entra no "por mix"). */
  total?: boolean;
};

const BOARDS: Board[] = [
  {
    title: "Maior vencedor de mix",
    value: (s) => s.wins,
    format: (n) => `${n} ${n === 1 ? "vitória" : "vitórias"}`,
    detail: (s) => `de ${s.mixes} ${s.mixes === 1 ? "jogado" : "jogados"}`,
    // Empate nas vitórias: quem jogou menos (melhor aproveitamento).
    tie: (s) => -s.mixes,
  },
  { title: "Maior K/D", value: (s) => s.kd, format: (n) => formatDecimal(n) },
  { title: "Maior ADR", value: (s) => s.adr, format: (n) => formatDecimal(n, 1) },
  { title: "Maior win rate", value: (s) => s.winRate, format: (n) => formatPercent(n) },
  { title: "Mais MVPs", value: (s) => s.mvps, format: (n) => String(n), total: true },
  { title: "Mais assistências", value: (s) => s.assists, format: (n) => formatInt(n), total: true },
  { title: "Mais first kills (FK)", value: (s) => s.firstKills, format: (n) => formatInt(n), total: true },
  { title: "Mais lanternas", value: (s) => s.lanterns, format: (n) => String(n), total: true },
];

const TABS = { mapas: "Mapas", lideres: "Líderes", gc: "Dados da GC" } as const;
type Tab = keyof typeof TABS;

export default async function StatsPage({ searchParams }: PageProps<"/estatisticas">) {
  const sp = await searchParams;
  // Sem período na URL: Geral (a página mostra a história toda por padrão).
  const period = sp.periodo == null ? "all" : parsePeriod(sp.periodo);
  const tab: Tab = typeof sp.aba === "string" && sp.aba in TABS ? (sp.aba as Tab) : "mapas";
  const perMix = sp.media === "mix";
  const [stats, session] = await Promise.all([getCommunityStats({ period }), getSession().catch(() => null)]);
  const { kind, community, totals, maps, leaders, minMixes, mapWinners, names, avatars, players, since } = stats;
  const gc = tab === "gc" || tab === "mapas" ? await getGcStats(since) : { lines: [], sides: {} };
  const viewerId = session?.id ?? null;

  const href = (over: Record<string, string | null>) => {
    const q = new URLSearchParams();
    const cur: Record<string, string | null> = {
      aba: tab === "mapas" ? null : tab,
      periodo: period === "all" ? null : period,
      media: perMix ? "mix" : null,
    };
    for (const [k, v] of Object.entries({ ...cur, ...over })) if (v) q.set(k, v);
    const qs = q.toString();
    return qs ? `/estatisticas?${qs}` : "/estatisticas";
  };
  const maxPlayed = Math.max(1, ...maps.map((m) => m.played));
  const anySides = maps.some((m) => gc.sides[m.mapId]?.rounds);

  return (
    <>
      <PageHeader
        eyebrow={community.name}
        title="Estatísticas"
        description="Números gerais da comunidade: mapas, volume de jogos, dados da GC e líderes por métrica."
        actions={<DemoBadge kind={kind} />}
      />

      <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <FilterTabs
          label="Seção"
          current={tab}
          options={Object.entries(TABS).map(([value, label]) => ({
            value,
            label,
            href: href({ aba: value === "mapas" ? null : value }),
          }))}
        />
        <FilterTabs
          label="Período"
          current={period}
          options={(Object.entries(RANKING_PERIODS) as [string, { label: string }][]).map(([value, p]) => ({
            value,
            label: p.label,
            href: href({ periodo: value === "all" ? null : value }),
          }))}
        />
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Mixes finalizados" value={formatInt(totals.mixes)} accent />
        <StatCard label="Mapas jogados" value={formatInt(totals.maps)} />
        <StatCard label="Rounds" value={formatInt(totals.rounds)} />
        <StatCard
          label="Jogadores"
          value={formatInt(totals.played)}
          hint={`jogaram, de ${formatInt(totals.players)} cadastrados`}
        />
      </section>

      {tab === "mapas" && (
        <>
          <Card className="mt-4">
            <CardHeader
              title="Mapas"
              description={`Jogos, rounds por jogo e diferença média de rounds (menor = mais equilibrado)${anySides ? "; CT vence = rounds ganhos pelo lado CT (dados da GC)" : ""}.`}
            />
            <Table>
              <THead>
                <TR>
                  <TH>Mapa</TH>
                  <TH className="text-right sm:w-1/3 sm:text-left">Jogos</TH>
                  <TH className="text-right">Rounds/jogo</TH>
                  <TH className="text-right" title="Diferença média de rounds entre os times">
                    Dif. média
                  </TH>
                  {anySides && (
                    <TH className="text-right" title="Rounds vencidos pelo lado CT (mapas importados da GC)">
                      CT vence
                    </TH>
                  )}
                </TR>
              </THead>
              <tbody>
                {maps.map((m) => {
                  const side = gc.sides[m.mapId];
                  const ct = side?.rounds ? (side.ctWins / side.rounds) * 100 : null;
                  return (
                    <TR key={m.mapId}>
                      <TD className="font-medium">
                        <span className="flex items-center gap-2">
                          <MapIcon id={m.mapId} size={22} />
                          {mapName(m.mapId)}
                        </span>
                      </TD>
                      <TD>
                        <span className="flex items-center justify-end gap-2 sm:justify-start">
                          <span
                            className="hidden h-2 min-w-16 flex-1 overflow-hidden rounded-full bg-surface-3 sm:block"
                            aria-hidden
                          >
                            <span
                              className="block h-full rounded-full bg-brand"
                              style={{ width: `${(m.played / maxPlayed) * 100}%` }}
                            />
                          </span>
                          <span className="w-6 text-right font-semibold tabular">{m.played}</span>
                        </span>
                      </TD>
                      <TD className="text-right text-muted">{formatDecimal(m.rounds / m.played, 1)}</TD>
                      <TD className="text-right">{formatDecimal(m.diff / m.played, 1)}</TD>
                      {anySides && (
                        <TD
                          className="text-right"
                          title={side?.rounds ? `${side.ctWins} de ${side.rounds} rounds` : "Sem dados da GC"}
                        >
                          {ct == null ? (
                            <span className="text-subtle">—</span>
                          ) : (
                            <span className={ct >= 55 ? "text-sky-400" : ct <= 45 ? "text-yellow-400" : ""}>
                              {formatPercent(ct)}
                            </span>
                          )}
                        </TD>
                      )}
                    </TR>
                  );
                })}
                {!maps.length && (
                  <TR>
                    <TD colSpan={5} className="py-6 text-center text-muted">
                      Nenhum mapa jogado no período.
                    </TD>
                  </TR>
                )}
              </tbody>
            </Table>
          </Card>

          {mapWinners.length > 0 && (
            <Card className="mt-4">
              <CardHeader
                title="Maiores vencedores por mapa"
                description="Escolha o mapa. Barra = jogos do jogador nele, em vitórias e derrotas (cada mapa vencido conta para os 5 do time). Menos de 3 jogos no mapa: no fim, apagado."
              />
              <CardContent>
                <MapWinners maps={mapWinners} names={names} avatars={avatars} viewerId={viewerId} />
              </CardContent>
            </Card>
          )}
        </>
      )}

      {tab !== "mapas" && (
        <div className="mt-6 mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-sm font-semibold tracking-wide text-muted uppercase">
            {tab === "lideres" ? "Líderes" : "Dados da GC"}{" "}
            <span className="tracking-normal text-subtle normal-case">
              {tab === "lideres"
                ? `· mínimo de ${minMixes} ${minMixes === 1 ? "mix" : "mixes"}`
                : "· mixes importados da Gamers Club"}
            </span>
          </h2>
          <FilterTabs
            label="Totais ou média"
            current={perMix ? "mix" : "total"}
            options={[
              { value: "total", label: "Totais", href: href({ media: null }) },
              { value: "mix", label: tab === "gc" ? "Por mapa" : "Por mix", href: href({ media: "mix" }) },
            ]}
          />
        </div>
      )}

      {tab === "lideres" && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {BOARDS.map((board) => {
            const avg = perMix && board.total;
            return (
              <LeaderBoard
                key={board.title}
                title={avg ? `${board.title} · por mix` : board.title}
                leaders={leaders}
                value={avg ? (st) => (st.mixes ? (board.value(st) ?? 0) / st.mixes : null) : board.value}
                format={avg ? (n) => formatDecimal(n, 2) : board.format}
                detail={avg ? (st) => `${board.format(board.value(st) ?? 0)} em ${st.mixes}` : board.detail}
                tie={board.tie}
                viewerId={viewerId}
              />
            );
          })}
        </div>
      )}
      {tab === "gc" &&
        (gc.lines.length > 0 ? (
          <GcLeaders lines={gc.lines} players={players} perMap={perMix} viewerId={viewerId} />
        ) : (
          <Card>
            <p className="px-4 py-8 text-center text-sm text-muted">Nenhum mix importado da GC no período.</p>
          </Card>
        ))}
    </>
  );
}

function LeaderBoard({
  title,
  leaders,
  value,
  format,
  detail,
  tie,
  viewerId,
}: {
  title: string;
  leaders: Leader[];
  viewerId?: string | null;
  value: (s: PlayerAggregate) => number | null;
  format: (n: number) => string;
  detail?: (s: PlayerAggregate) => string;
  tie?: (s: PlayerAggregate) => number;
}) {
  const top = leaders
    .map((l) => ({ ...l, v: value(l.stats) }))
    // Zero não é liderança (ex.: "Mais MVPs" com 0).
    .filter((l): l is Leader & { v: number } => l.v != null && l.v > 0)
    .sort((a, b) => b.v - a.v || (tie ? tie(b.stats) - tie(a.stats) : 0))
    .slice(0, 5);
  return (
    <Card>
      <CardHeader title={title} />
      <ol className="divide-y divide-border">
        {top.map((l, i) => (
          <li
            key={l.player.id}
            className={cn("flex items-center gap-3 px-4 py-2.5 text-sm", l.player.id === viewerId && "bg-brand/8")}
          >
            <span className={i === 0 ? "w-4 font-display font-bold text-brand" : "w-4 font-display text-subtle"}>
              {i + 1}
            </span>
            <PlayerLink player={l.player} className="flex-1" highlight={l.player.id === viewerId} />
            <span className="text-right">
              <span className="font-semibold tabular">{format(l.v)}</span>
              {detail && <span className="block text-[11px] text-muted tabular">{detail(l.stats)}</span>}
            </span>
          </li>
        ))}
        {!top.length && <li className="px-4 py-6 text-center text-sm text-muted">Sem dados suficientes.</li>}
      </ol>
    </Card>
  );
}

/** Seção "Dados da GC": um card de líderes por métrica, no mesmo estilo dos Líderes. */
function GcLeaders({
  lines,
  players,
  perMap,
  viewerId,
}: {
  lines: GcLine[];
  players: Player[];
  perMap: boolean;
  viewerId: string | null;
}) {
  const byId = new Map(players.map((p) => [p.id, p]));
  // Mínimo de mapas para entrar: 3, ou menos enquanto houver poucos mapas importados.
  const minMaps = Math.min(3, Math.max(...lines.map((l) => l.maps)));
  const pool = lines
    .filter((l) => l.maps >= minMaps && l.userId && byId.has(l.userId))
    .map((l) => ({ line: l, player: byId.get(l.userId!)! }));
  // Arma principal: quantos jogadores têm cada arma como a mais usada.
  const weapons = [
    ...pool
      .reduce((m, { line }) => {
        const w = line.aim.mainWeapon;
        return w ? m.set(w, (m.get(w) ?? 0) + 1) : m;
      }, new Map<string, number>())
      .entries(),
  ]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  if (!pool.length) return null;
  const board = (b: GcBoard) => {
    const avg = perMap && b.total;
    const top = pool
      .map((r) => {
        const raw = b.value(r.line);
        return { ...r, raw, v: raw == null ? null : avg ? raw / Math.max(r.line.maps, 1) : raw };
      })
      .filter((r): r is typeof r & { v: number } => r.v != null && r.v > 0)
      .sort((x, y) => y.v - x.v || y.line.rounds - x.line.rounds)
      .slice(0, 5);
    return (
      <Card key={b.title}>
        <CardHeader title={avg ? `${b.title} · por mapa` : b.title} />
        <ol className="divide-y divide-border">
          {top.map((l, i) => (
            <li
              key={l.player.id}
              className={cn("flex items-center gap-3 px-4 py-2.5 text-sm", l.player.id === viewerId && "bg-brand/8")}
            >
              <span className={i === 0 ? "w-4 font-display font-bold text-brand" : "w-4 font-display text-subtle"}>
                {i + 1}
              </span>
              <PlayerLink player={l.player} className="flex-1" highlight={l.player.id === viewerId} />
              <span className="text-right">
                <span className="font-semibold tabular">{avg ? formatDecimal(l.v, 1) : b.format(l.v)}</span>
                {avg && (
                  <span className="block text-[11px] text-muted tabular">
                    {b.format(l.raw ?? 0)} em {l.line.maps}
                  </span>
                )}
              </span>
            </li>
          ))}
          {!top.length && <li className="px-4 py-6 text-center text-sm text-muted">Sem dados suficientes.</li>}
        </ol>
      </Card>
    );
  };
  return (
    <>
      <p className="-mt-1 mb-3 text-xs text-subtle">
        Mínimo de {minMaps} {minMaps === 1 ? "mapa" : "mapas"} para entrar.
      </p>
      {GC_GROUPS.map((g, gi) => (
        <section key={g.title} className={gi ? "mt-5" : ""}>
          <h3 className="mb-2 text-xs font-semibold tracking-wider text-muted uppercase">{g.title}</h3>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {g.boards.map(board)}
            {g.title === "Mira" && weapons.length > 0 && (
              <Card>
                <CardHeader title="Arma principal" />
                <ol className="divide-y divide-border">
                  {weapons.map(([w, n], i) => (
                    <li key={w} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                      <span
                        className={i === 0 ? "w-4 font-display font-bold text-brand" : "w-4 font-display text-subtle"}
                      >
                        {i + 1}
                      </span>
                      <span className="flex-1 font-medium">{w}</span>
                      <span className="text-muted tabular">
                        {n} {n === 1 ? "jogador" : "jogadores"}
                      </span>
                    </li>
                  ))}
                </ol>
              </Card>
            )}
          </div>
        </section>
      ))}
    </>
  );
}
