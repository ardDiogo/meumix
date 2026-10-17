import { ArrowLeft, Crosshair, ExternalLink, Flame, Link2, ShieldCheck, Trophy } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DemoBadge } from "@/components/demo-notice";
import { ResultBadge } from "@/components/mixes/badges";
import { Delta } from "@/components/stats/delta";
import { EloChart } from "@/components/stats/elo-chart";
import { FormStrip } from "@/components/stats/form-strip";
import { StatCard } from "@/components/stats/stat-card";
import { ComparePlayers } from "@/components/players/compare-players";
import { LevelBadge } from "@/components/players/level-badge";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { eloChangeSince, toEloSeries } from "@/lib/elo";
import { formatDate, formatDecimal, formatPercent } from "@/lib/format";
import { steamProfileUrl } from "@/lib/integrations/steam";
import { allstarProfileUrl } from "@/lib/allstar";
import { ClipCard } from "@/components/clips/clip-card";
import { MapRecords, RecentMatches } from "@/components/players/map-records";
import { PlayerForm } from "@/components/players/player-form";
import { formSeries, mapRecords, mapTimeline } from "@/lib/player-form";
import { toClipViews } from "@/services/clips";
import { mapName } from "@/lib/maps";
import { seriesScore } from "@/lib/stats";
import { getDataSource } from "@/services";
import { getHighlightsFeed, getPlayerHighlights, resolvePlayerProfile, searchPlayers } from "@/services/queries";
import { playerHref, playerSlug } from "@/lib/player-slug";
import { CsrepCard } from "@/components/players/csrep-card";
import { getPermissions } from "@/services/auth";
import { getCsrepView } from "@/services/csrep";
import { BadgeIcon } from "@/components/badges/badge-icon";
import { playerBadges } from "@/services/badges";
import { mixHref } from "@/lib/mix-slug";
import { MapIcon } from "@/components/maps/map-icon";
import { SteamIcon } from "@/components/players/steam-icon";
import { TwitchIcon } from "@/components/twitch/twitch-icon";
import { TwitchStreams } from "@/components/twitch/twitch-streams";
import { twitchChannelUrl } from "@/lib/twitch";
import { liveChannels, profileTwitch, toStreamItems } from "@/services/twitch";

export async function generateMetadata({ params }: PageProps<"/jogadores/[id]">): Promise<Metadata> {
  const profile = await resolvePlayerProfile((await params).id);
  return { title: profile?.player.nickname ?? "Jogador não encontrado" };
}

export default async function PlayerProfilePage({ params, searchParams }: PageProps<"/jogadores/[id]">) {
  const [{ id }, { comparar }] = await Promise.all([params, searchParams]);
  const otherId = typeof comparar === "string" && comparar !== id ? comparar : null;
  const [profile, other, allPlayers] = await Promise.all([
    resolvePlayerProfile(id),
    otherId ? resolvePlayerProfile(otherId) : null,
    searchPlayers(""),
  ]);
  if (!profile) notFound();
  // Endereço com o nick: /jogadores/<id> vira /jogadores/barker.
  const canonical = playerHref(profile.player);
  const slugTaken =
    allPlayers.filter((p) => playerSlug(p.player.nickname) === playerSlug(profile.player.nickname)).length > 1;
  if (!slugTaken && decodeURIComponent(`/jogadores/${id}`) !== canonical) {
    redirect(otherId ? `${canonical}?comparar=${encodeURIComponent(otherId)}` : canonical);
  }

  const ds = getDataSource();
  const kind = ds.kind;
  const { player, elo, position, totalPlayers, stats, eloHistory, recentMixes } = profile;
  const highlights = getPlayerHighlights(profile);
  const series = toEloSeries(eloHistory, new Map(recentMixes.map((r) => [r.mix.id, r.mix.name])));
  const recentChange = eloChangeSince(eloHistory, new Date(ds.now().getTime() - 30 * 86_400_000));
  const steamUrl = steamProfileUrl(player.steamId);
  const allstarUrl = allstarProfileUrl(player.steamId);
  const playedMixes = recentMixes.map((r) => r.mix);
  const formPoints = formSeries(playedMixes, player.id);
  const mapRecs = mapRecords(playedMixes, player.id);
  const timeline = mapTimeline(playedMixes, player.id);
  const [{ session, canManageMixes }, csrep, badges, feed, twitchLogin, live] = await Promise.all([
    getPermissions(),
    kind === "supabase" ? getCsrepView(player.id, player.steamId) : null,
    playerBadges([player.id]),
    getHighlightsFeed(),
    kind === "supabase" ? profileTwitch([player.id]).then((m) => m.get(player.id) ?? null) : null,
    kind === "supabase" ? liveChannels([player.id]) : [],
  ]);
  const liveItems = toStreamItems(live, new Map([[player.id, player]]));
  const clips = toClipViews(
    feed.highlights.filter((h) => h.playerId === player.id),
    { players: feed.players, mixes: feed.mixes, viewerId: session?.id ?? null, canManage: canManageMixes },
  );

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
            {badges.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Insígnias">
                {badges.map((b) => (
                  <li
                    key={b.id}
                    title={
                      [b.description, b.unlock && `Desbloqueio: ${b.unlock}`, b.note].filter(Boolean).join(" · ") ||
                      b.name
                    }
                    className="flex items-center gap-1.5 rounded-full border py-0.5 pr-2.5 pl-0.5 text-xs font-semibold"
                    style={{ borderColor: `${b.color}55`, color: b.color }}
                  >
                    <BadgeIcon icon={b.icon} color={b.color} size="xs" className="rounded-full" />
                    {b.name}
                  </li>
                ))}
              </ul>
            )}
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
                    <SteamIcon className="text-[#66C0F4]" /> Perfil Steam
                  </a>
                </Button>
              ) : (
                <Badge variant="neutral" title="Vincule a Steam em Configurações → Perfil">
                  <Link2 aria-hidden /> Steam não vinculada
                </Badge>
              )}
              {csrep?.url && (
                <Button variant="outline" size="sm" asChild>
                  <a href={csrep.url} target="_blank" rel="noopener noreferrer">
                    <BrandLogo src="/brands/csrep.png" /> CSRep
                  </a>
                </Button>
              )}
              {allstarUrl && (
                <Button variant="outline" size="sm" asChild>
                  <a href={allstarUrl} target="_blank" rel="noopener noreferrer">
                    <BrandLogo src="/brands/allstar.png" /> Clipes no Allstar
                  </a>
                </Button>
              )}
              {twitchLogin && (
                <Button variant="outline" size="sm" asChild>
                  <a href={twitchChannelUrl(twitchLogin)} target="_blank" rel="noopener noreferrer">
                    <TwitchIcon className="text-[#9146FF]" /> Twitch
                    {liveItems.length > 0 && (
                      <span className="rounded-sm bg-loss px-1 text-[10px] font-bold text-white uppercase">
                        Ao vivo
                      </span>
                    )}
                  </a>
                </Button>
              )}
            </div>
          </div>
          <div className="flex gap-6 sm:text-right">
            <div>
              <div className="text-[11px] font-semibold tracking-wider text-muted uppercase">ELO</div>
              <div className="flex items-center gap-2">
                <LevelBadge elo={elo} size="md" />
                <span className="font-display text-4xl font-bold text-brand tabular">{elo}</span>
              </div>
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

      <section aria-label="Estatísticas gerais" className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <StatCard label="Mixes" value={stats.mixes} hint={`${stats.wins}V · ${stats.losses}D`} />
        <StatCard label="Win rate" value={formatPercent(stats.winRate)} />
        <StatCard label="K/D" value={formatDecimal(stats.kd)} hint={`${stats.kills} K · ${stats.deaths} D`} />
        <StatCard label="ADR" value={formatDecimal(stats.adr, 1)} />
        <StatCard label="KAST" value={formatPercent(stats.kast)} />
        <StatCard label="MVPs" value={stats.mvps} />
        <StatCard label="Lanternas" value={stats.lanterns} hint="Pior saldo K−D do mix" />
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
              href={mixHref(highlights.lastMvp.mix)}
              className="block border-t border-border px-4 py-3 text-sm transition-colors hover:bg-surface-2"
            >
              <span className="text-muted">Último MVP:</span>{" "}
              <span className="font-medium text-brand">{highlights.lastMvp.mix.name}</span>{" "}
              <span className="text-subtle">· {formatDate(highlights.lastMvp.mix.scheduledAt)}</span>
            </Link>
          )}
        </Card>
      </div>

      {liveItems.length > 0 && <TwitchStreams className="mt-4" title="Ao vivo agora" items={liveItems} />}

      <PlayerForm points={formPoints} />
      <RecentMatches timeline={timeline} />
      <MapRecords records={mapRecs} />

      {(clips.length > 0 || allstarUrl) && (
        <Card className="mt-4">
          <CardHeader
            title="Clipes"
            description={
              clips.length
                ? `${clips.length} clipe${clips.length > 1 ? "s" : ""} enviado${clips.length > 1 ? "s" : ""} ao MeuMix`
                : "Nenhum clipe enviado ao MeuMix ainda."
            }
            action={
              allstarUrl && (
                <Button variant="ghost" size="sm" asChild>
                  <a href={allstarUrl} target="_blank" rel="noopener noreferrer">
                    Todos no Allstar <ExternalLink />
                  </a>
                </Button>
              )
            }
          />
          {clips.length > 0 && (
            <CardContent>
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {clips.slice(0, 6).map((c) => (
                  <li key={c.id}>
                    <ClipCard clip={c} />
                  </li>
                ))}
              </ul>
            </CardContent>
          )}
        </Card>
      )}

      {csrep && (
        <CsrepCard
          userId={player.id}
          view={csrep}
          canEdit={!!session && (session.id === player.id || canManageMixes)}
        />
      )}

      <ComparePlayers
        player={player}
        stats={stats}
        other={other && { player: other.player, stats: other.stats }}
        options={allPlayers
          .filter((p) => p.player.id !== player.id)
          .map((p) => ({ id: p.player.id, label: `${p.player.nickname} (ELO ${p.elo})` }))}
      />

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
                      <Link href={mixHref(r.mix)} className="font-medium hover:text-brand">
                        {r.mix.name}
                      </Link>
                      {r.isMvp && <span className="ml-2 text-[10px] font-bold text-brand uppercase">MVP</span>}
                    </TD>
                    <TD className="text-muted">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        {r.mix.maps.map((m) => (
                          <span key={m.order} className="inline-flex items-center gap-1">
                            <MapIcon id={m.mapId} size={16} />
                            {mapName(m.mapId)}
                          </span>
                        ))}
                      </span>
                    </TD>
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

/** Logo de um serviço externo (PNG sem fundo) no tamanho dos ícones dos botões. */
function BrandLogo({ src }: { src: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" aria-hidden className="size-4 shrink-0 object-contain" />;
}
