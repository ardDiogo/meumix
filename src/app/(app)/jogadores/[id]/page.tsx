import { ArrowLeft, Crosshair, Flame, Link2, ShieldCheck, Trophy } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DemoBadge } from "@/components/demo-notice";
import { ResultBadge } from "@/components/mixes/badges";
import { Delta } from "@/components/stats/delta";
import { EloChart } from "@/components/stats/elo-chart";
import { FormStrip } from "@/components/stats/form-strip";
import { StatCard } from "@/components/stats/stat-card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { eloChangeSince, toEloSeries } from "@/lib/elo";
import { formatDate, formatDecimal, formatPercent } from "@/lib/format";
import { steamProfileUrl } from "@/lib/integrations/steam";
import { mapName } from "@/lib/maps";
import { seriesScore } from "@/lib/stats";
import { getDataSource } from "@/services";
import { getPlayerHighlights, getPlayerProfile } from "@/services/queries";

export async function generateMetadata({ params }: PageProps<"/jogadores/[id]">): Promise<Metadata> {
  const profile = await getPlayerProfile((await params).id);
  return { title: profile?.player.nickname ?? "Jogador não encontrado" };
}

export default async function PlayerProfilePage({ params }: PageProps<"/jogadores/[id]">) {
  const profile = await getPlayerProfile((await params).id);
  if (!profile) notFound();

  const ds = getDataSource();
  const kind = ds.kind;
  const { player, elo, position, totalPlayers, stats, eloHistory, recentMixes } = profile;
  const highlights = getPlayerHighlights(profile);
  const series = toEloSeries(eloHistory, new Map(recentMixes.map((r) => [r.mix.id, r.mix.name])));
  const recentChange = eloChangeSince(eloHistory, new Date(ds.now().getTime() - 30 * 86_400_000));
  const steamUrl = steamProfileUrl(player.steamId);

  return (
    <>
      <Button variant="ghost" size="sm" className="mb-3 -ml-2" asChild>
        <Link href="/jogadores">
          <ArrowLeft /> Jogadores
        </Link>
      </Button>

      {/* Cabeçalho do perfil */}
      <Card className="mb-4">
        <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
          <Avatar name={player.nickname} src={player.avatarUrl} size="xl" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl font-bold tracking-tight">{player.nickname}</h1>
              <DemoBadge kind={kind} />
            </div>
            <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <div className="flex gap-1.5">
                <dt className="text-muted">Steam ID</dt>
                <dd className="tabular">{player.steamId ?? <span className="text-subtle">não vinculado</span>}</dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="text-muted">Membro desde</dt>
                <dd>{formatDate(player.createdAt)}</dd>
              </div>
            </dl>
            <div className="mt-3 flex flex-wrap gap-2">
              {steamUrl ? (
                <Button variant="outline" size="sm" asChild>
                  <a href={steamUrl} target="_blank" rel="noopener noreferrer">
                    <Link2 /> Perfil Steam
                  </a>
                </Button>
              ) : (
                <Badge variant="neutral" title="A integração com a Steam ainda não foi implementada">
                  <Link2 aria-hidden /> Steam não vinculada
                </Badge>
              )}
              <Badge variant="neutral" title="A integração com o CSRep ainda não foi implementada">
                CSRep · em breve
              </Badge>
            </div>
          </div>
          <div className="flex gap-6 sm:text-right">
            <div>
              <div className="text-[11px] font-semibold tracking-wider text-muted uppercase">ELO</div>
              <div className="font-display text-4xl font-bold text-brand tabular">{elo}</div>
              <Delta value={recentChange} className="mt-0.5" />
              <div className="text-[10px] text-subtle">em 30 dias</div>
            </div>
            <div>
              <div className="text-[11px] font-semibold tracking-wider text-muted uppercase">Ranking</div>
              <div className="font-display text-4xl font-bold tabular">{position ? `#${position}` : "—"}</div>
              <div className="text-xs text-muted">de {totalPlayers}</div>
            </div>
          </div>
        </div>
      </Card>

      <section aria-label="Estatísticas gerais" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Mixes" value={stats.mixes} hint={`${stats.wins}V · ${stats.losses}D`} />
        <StatCard label="Win rate" value={formatPercent(stats.winRate)} />
        <StatCard label="K/D" value={formatDecimal(stats.kd)} hint={`${stats.kills} K · ${stats.deaths} D`} />
        <StatCard label="ADR" value={formatDecimal(stats.adr, 1)} />
        <StatCard label="KAST" value={formatPercent(stats.kast)} />
        <StatCard label="MVPs" value={stats.mvps} />
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Evolução do ELO" action={<DemoBadge kind={kind} />} />
          <CardContent className="pb-2">
            <EloChart data={series} />
          </CardContent>
          <div className="border-t border-border p-4">
            <div className="mb-2 text-[11px] font-semibold tracking-wider text-muted uppercase">Últimos resultados</div>
            <FormStrip
              results={recentMixes
                .slice(0, 15)
                .reverse()
                .map((r) => r.result)}
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="Destaques individuais" description="Últimos 10 mixes" />
          <dl className="grid grid-cols-2 gap-px bg-border">
            <Highlight icon={Trophy} label="MVPs (total)" value={stats.mvps} />
            <Highlight
              icon={Flame}
              label="Melhor K/A/D"
              value={
                highlights.bestRecent
                  ? `${highlights.bestRecent.kills}/${highlights.bestRecent.assists}/${highlights.bestRecent.deaths}`
                  : "—"
              }
            />
            <Highlight icon={ShieldCheck} label="Clutches" value={highlights.clutchesWon} />
            <Highlight icon={Crosshair} label="First kills" value={highlights.firstKills} />
          </dl>
          {highlights.lastMvp && (
            <Link
              href={`/mixes/${highlights.lastMvp.mix.id}`}
              className="block border-t border-border px-4 py-3 text-sm transition-colors hover:bg-surface-2"
            >
              <span className="text-muted">Último MVP:</span>{" "}
              <span className="font-medium text-brand">{highlights.lastMvp.mix.name}</span>{" "}
              <span className="text-subtle">· {formatDate(highlights.lastMvp.mix.scheduledAt)}</span>
            </Link>
          )}
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title="Histórico de mixes" description={`${recentMixes.length} partidas`} />
        {recentMixes.length ? (
          <Table>
            <THead>
              <TR>
                <TH>Data</TH>
                <TH>Mix</TH>
                <TH>Mapas</TH>
                <TH className="text-center">Placar</TH>
                <TH>Resultado</TH>
                <TH className="text-right">K</TH>
                <TH className="text-right">A</TH>
                <TH className="text-right">D</TH>
                <TH className="text-right">ADR</TH>
              </TR>
            </THead>
            <tbody>
              {recentMixes.map((r) => {
                const score = seriesScore(r.mix);
                const own = score && (r.side === "A" ? score : [score[1], score[0]]);
                return (
                  <TR key={r.mix.id} className="hover:bg-surface-2/50">
                    <TD className="text-muted">{formatDate(r.mix.scheduledAt)}</TD>
                    <TD>
                      <Link href={`/mixes/${r.mix.id}`} className="font-medium hover:text-brand">
                        {r.mix.name}
                      </Link>
                      {r.isMvp && <span className="ml-2 text-[10px] font-bold text-brand uppercase">MVP</span>}
                    </TD>
                    <TD className="text-muted">{r.mix.maps.map((m) => mapName(m.mapId)).join(", ")}</TD>
                    <TD className="text-center font-semibold">{own ? `${own[0]}–${own[1]}` : "—"}</TD>
                    <TD>
                      <ResultBadge result={r.result} />
                    </TD>
                    <TD className="text-right font-semibold">{r.kills}</TD>
                    <TD className="text-right text-muted">{r.assists}</TD>
                    <TD className="text-right text-muted">{r.deaths}</TD>
                    <TD className="text-right">{formatDecimal(r.adr, 1)}</TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        ) : (
          <EmptyState
            icon={Crosshair}
            title="Nenhum mix disputado"
            description="As partidas deste jogador aparecerão aqui."
          />
        )}
      </Card>
    </>
  );
}

function Highlight({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="bg-surface p-4">
      <dt className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-muted uppercase">
        <Icon className="size-3.5" /> {label}
      </dt>
      <dd className="mt-1 font-display text-xl font-bold tabular">{value}</dd>
    </div>
  );
}
