import type { Metadata } from "next";
import { DemoBadge } from "@/components/demo-notice";
import { PageHeader } from "@/components/page-header";
import { PlayerLink } from "@/components/players/player-link";
import { MapsChart } from "@/components/stats/maps-chart";
import { MapWinners } from "@/components/stats/map-winners";
import { StatCard } from "@/components/stats/stat-card";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDecimal, formatInt, formatPercent } from "@/lib/format";
import { mapName } from "@/lib/maps";
import type { Player } from "@/types/domain";
import type { PlayerAggregate } from "@/types/views";
import { getCommunityStats } from "@/services/queries";
import { MapIcon } from "@/components/maps/map-icon";
import type { GcLine } from "@/lib/gc-analysis";
import { getGcCareer } from "@/services/gc-maps";

export const metadata: Metadata = { title: "Estatísticas" };

type Leader = { player: Player; stats: PlayerAggregate };

const pct = (part: number, total: number) => (total ? (part / total) * 100 : null);

/** Líderes com os dados da GC (soma de todos os mapas importados). */
const GC_BOARDS: { title: string; value: (g: GcLine) => number | null; format: (n: number) => string }[] = [
  { title: "Maior rating", value: (g) => g.rating, format: (n) => formatDecimal(n) },
  {
    title: "Maior swing",
    value: (g) => (g.swing == null ? null : g.swing * 100),
    format: (n) => `${n > 0 ? "+" : ""}${formatDecimal(n, 1)}%`,
  },
  { title: "Mais aberturas vencidas", value: (g) => g.entries.won, format: (n) => formatInt(n) },
  {
    title: "Sucesso na abertura",
    // Com poucos duelos a porcentagem engana: mínimo de 10.
    value: (g) => (g.entries.duels >= 10 ? pct(g.entries.won, g.entries.duels) : null),
    format: (n) => formatPercent(n),
  },
  { title: "Mais trades", value: (g) => g.trades.made, format: (n) => formatInt(n) },
  { title: "Mais clutches vencidos", value: (g) => g.clutch.won, format: (n) => formatInt(n) },
  { title: "Mais dano com granada", value: (g) => g.utility.damage, format: (n) => formatInt(n) },
  { title: "Mais inimigos cegados", value: (g) => g.utility.flashed, format: (n) => formatInt(n) },
  { title: "Mais flash assists", value: (g) => g.fa, format: (n) => formatInt(n) },
  { title: "Mais granadas", value: (g) => g.utility.grenades, format: (n) => formatInt(n) },
  { title: "Maior precisão", value: (g) => g.aim.accuracy, format: (n) => formatPercent(n) },
  { title: "Maior HS%", value: (g) => g.hsRate, format: (n) => formatPercent(n) },
  { title: "Maior head acc.", value: (g) => g.aim.headAccuracy, format: (n) => formatPercent(n) },
  {
    title: "Abates por round",
    value: (g) => (g.rounds ? g.k / g.rounds : null),
    format: (n) => formatDecimal(n),
  },
];

const BOARDS: { title: string; value: (s: PlayerAggregate) => number | null; format: (n: number) => string }[] = [
  { title: "Maior K/D", value: (s) => s.kd, format: (n) => formatDecimal(n) },
  { title: "Maior ADR", value: (s) => s.adr, format: (n) => formatDecimal(n, 1) },
  { title: "Maior win rate", value: (s) => s.winRate, format: (n) => formatPercent(n) },
  { title: "Mais MVPs", value: (s) => s.mvps, format: (n) => String(n) },
  { title: "Mais assistências", value: (s) => s.assists, format: (n) => formatInt(n) },
  { title: "Mais first kills (FK)", value: (s) => s.firstKills, format: (n) => formatInt(n) },
  { title: "Mais lanternas", value: (s) => s.lanterns, format: (n) => String(n) },
];

export default async function StatsPage() {
  const [{ kind, community, totals, maps, leaders, minMixes, mapWinners, names, avatars, players }, gcCareer] =
    await Promise.all([getCommunityStats(), getGcCareer()]);

  return (
    <>
      <PageHeader
        eyebrow={community.name}
        title="Estatísticas"
        description="Números gerais da comunidade: mapas, volume de jogos, dados da GC e líderes por métrica."
        actions={<DemoBadge kind={kind} />}
      />

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Mixes finalizados" value={formatInt(totals.mixes)} accent />
        <StatCard label="Mapas jogados" value={formatInt(totals.maps)} />
        <StatCard label="Rounds" value={formatInt(totals.rounds)} />
        <StatCard label="Jogadores" value={formatInt(totals.players)} />
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Mapas mais jogados" />
          <CardContent>
            <MapsChart data={maps.map((m) => ({ name: mapName(m.mapId), played: m.played }))} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader
            title="Detalhe por mapa"
            description="Média de rounds e vitórias do time A (lado da esquerda no placar)"
          />
          <Table>
            <THead>
              <TR>
                <TH>Mapa</TH>
                <TH className="text-right">Jogos</TH>
                <TH className="text-right">Rounds/jogo</TH>
                <TH className="text-right">Vit. time A</TH>
              </TR>
            </THead>
            <tbody>
              {maps.map((m) => (
                <TR key={m.mapId}>
                  <TD className="font-medium">
                    <span className="flex items-center gap-2">
                      <MapIcon id={m.mapId} size={22} />
                      {mapName(m.mapId)}
                    </span>
                  </TD>
                  <TD className="text-right">{m.played}</TD>
                  <TD className="text-right text-muted">{formatDecimal(m.rounds / m.played, 1)}</TD>
                  <TD className="text-right">{formatPercent((m.sideAWins / m.played) * 100)}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>

      {mapWinners.length > 0 && (
        <Card className="mt-4">
          <CardHeader
            title="Maiores vencedores por mapa"
            description="Escolha o mapa. Barra = jogos do jogador nele, em vitórias e derrotas (cada mapa vencido conta para os 5 do time)."
          />
          <CardContent>
            <MapWinners maps={mapWinners} names={names} avatars={avatars} />
          </CardContent>
        </Card>
      )}

      <h2 className="mt-6 mb-3 font-display text-sm font-semibold tracking-wide text-muted uppercase">
        Líderes{" "}
        <span className="tracking-normal text-subtle normal-case">
          · mínimo de {minMixes} {minMixes === 1 ? "mix" : "mixes"}
        </span>
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {BOARDS.map((board) => (
          <LeaderBoard
            key={board.title}
            title={board.title}
            leaders={leaders}
            value={board.value}
            format={board.format}
          />
        ))}
      </div>
      {gcCareer.length > 0 && <GcLeaders lines={gcCareer} players={players} />}
    </>
  );
}

function LeaderBoard({
  title,
  leaders,
  value,
  format,
}: {
  title: string;
  leaders: Leader[];
  value: (s: PlayerAggregate) => number | null;
  format: (n: number) => string;
}) {
  const top = leaders
    .map((l) => ({ ...l, v: value(l.stats) }))
    .filter((l): l is Leader & { v: number } => l.v != null)
    .sort((a, b) => b.v - a.v)
    .slice(0, 5);
  return (
    <Card>
      <CardHeader title={title} />
      <ol className="divide-y divide-border">
        {top.map((l, i) => (
          <li key={l.player.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
            <span className={i === 0 ? "w-4 font-display font-bold text-brand" : "w-4 font-display text-subtle"}>
              {i + 1}
            </span>
            <PlayerLink player={l.player} className="flex-1" />
            <span className="font-semibold tabular">{format(l.v)}</span>
          </li>
        ))}
        {!top.length && <li className="px-4 py-6 text-center text-sm text-muted">Sem dados suficientes.</li>}
      </ol>
    </Card>
  );
}

/** Seção "Dados da GC": um card de líderes por métrica, no mesmo estilo dos Líderes. */
function GcLeaders({ lines, players }: { lines: GcLine[]; players: Player[] }) {
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
  return (
    <>
      <h2 className="mt-6 mb-3 font-display text-sm font-semibold tracking-wide text-muted uppercase">
        Dados da GC{" "}
        <span className="tracking-normal text-subtle normal-case">
          · todos os mixes importados da Gamers Club · mínimo de {minMaps} {minMaps === 1 ? "mapa" : "mapas"}
        </span>
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {GC_BOARDS.map((board) => {
          const top = pool
            .map((r) => ({ ...r, v: board.value(r.line) }))
            .filter((r): r is typeof r & { v: number } => r.v != null && r.v > 0)
            .sort((a, b) => b.v - a.v || b.line.rounds - a.line.rounds)
            .slice(0, 5);
          return (
            <Card key={board.title}>
              <CardHeader title={board.title} />
              <ol className="divide-y divide-border">
                {top.map((l, i) => (
                  <li key={l.player.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <span
                      className={i === 0 ? "w-4 font-display font-bold text-brand" : "w-4 font-display text-subtle"}
                    >
                      {i + 1}
                    </span>
                    <PlayerLink player={l.player} className="flex-1" />
                    <span className="font-semibold tabular">{board.format(l.v)}</span>
                  </li>
                ))}
                {!top.length && <li className="px-4 py-6 text-center text-sm text-muted">Sem dados suficientes.</li>}
              </ol>
            </Card>
          );
        })}
        {weapons.length > 0 && (
          <Card>
            <CardHeader title="Arma principal" />
            <ol className="divide-y divide-border">
              {weapons.map(([w, n], i) => (
                <li key={w} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className={i === 0 ? "w-4 font-display font-bold text-brand" : "w-4 font-display text-subtle"}>
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
    </>
  );
}
