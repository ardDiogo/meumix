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

export const metadata: Metadata = { title: "Estatísticas" };

type Leader = { player: Player; stats: PlayerAggregate };

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
  const { kind, community, totals, maps, leaders, minMixes, mapWinners, names } = await getCommunityStats();

  return (
    <>
      <PageHeader
        eyebrow={community.name}
        title="Estatísticas"
        description="Números gerais da comunidade: mapas, volume de jogos e líderes por métrica."
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
            description="Fatia = vitórias do jogador naquele mapa (cada mapa vencido conta para os 5 do time). Passe o mouse para ver o aproveitamento."
          />
          <CardContent>
            <MapWinners maps={mapWinners} names={names} />
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
