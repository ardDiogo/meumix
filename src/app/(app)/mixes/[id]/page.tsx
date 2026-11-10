import { ArrowLeft, Clapperboard, ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DemoBadge } from "@/components/demo-notice";
import { StatusBadge, TeamDot } from "@/components/mixes/badges";
import { Scoreboard } from "@/components/mixes/scoreboard";
import { PageHeader } from "@/components/page-header";
import { PlayerLink } from "@/components/players/player-link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateTime } from "@/lib/format";
import { mapName } from "@/lib/maps";
import { seriesScore, seriesWinner } from "@/lib/stats";
import { cn } from "@/lib/utils";
import { getMixDetail } from "@/services/queries";
import { getMatchReport, playerAverages } from "@/services/match-report";
import { byMixScore } from "@/lib/match-highlights";
import { MatchPerformance } from "@/components/mixes/match-performance";
import { getGcMaps } from "@/services/gc-maps";
import { aggregateGc } from "@/lib/gc-analysis";
import { matchAnalysis } from "@/lib/match-analysis";
import type { MapId } from "@/types/domain";
import { GenerateAnalysis, MatchAnalysis } from "@/components/mixes/match-analysis";
import { getAnalysis } from "@/services/match-analysis";
import { RoundDots } from "@/components/mixes/round-strip";
import { MatchHighlights } from "@/components/mixes/match-highlights";
import { MatchStatsTable } from "@/components/mixes/match-stats-table";
import { LinkGuests } from "@/components/mixes/link-guests";
import { ShareResult } from "@/components/mixes/share-result";
import { DeleteMatchButton } from "@/components/mixes/delete-match-button";
import { EditMatchDate } from "@/components/mixes/edit-match-date";
import { getPermissions } from "@/services/auth";
import { getDataSource } from "@/services";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { AddClipDialog } from "@/components/clips/add-clip-dialog";
import { ClipCard } from "@/components/clips/clip-card";
import { ImportAllstarDialog } from "@/components/clips/import-allstar-dialog";
import { ImportTwitchButton } from "@/components/clips/import-twitch-button";
import { TwitchStreams } from "@/components/twitch/twitch-streams";
import { mixBroadcasts, toStreamItems } from "@/services/twitch";
import { toClipViews } from "@/services/clips";
import { allstarProfileUrl } from "@/lib/allstar";
import { MapIcon } from "@/components/maps/map-icon";
import { BolaoResult } from "@/components/bolao/bolao-result";
import { ChronicleCard } from "@/components/mixes/chronicle-card";

// Importar clipes do Allstar e da Twitch consulta vários jogadores.
export const maxDuration = 60;

export async function generateMetadata({ params }: PageProps<"/mixes/[id]">): Promise<Metadata> {
  const detail = await getMixDetail((await params).id);
  return { title: detail?.mix.name ?? "Mix não encontrado" };
}

export default async function MixDetailPage({ params }: PageProps<"/mixes/[id]">) {
  const { id: param } = await params;
  const detail = await getMixDetail(param);
  if (!detail) notFound();
  // Endereço amigável: /mixes/<id> vira /mixes/outubro13.
  if (decodeURIComponent(param) !== detail.slug) redirect(`/mixes/${detail.slug}`);
  const { kind, mix, players, scoreboard, mapScoreboards, highlights } = detail;
  const [report, gcMaps, aiAnalysis] =
    kind === "supabase" && mix.status === "finished"
      ? await Promise.all([getMatchReport(mix.id), getGcMaps(mix.id), getAnalysis(mix.id)])
      : [null, [], null];
  const PLATFORM = { gc: "GC", faceit: "Faceit", manual: "Manual" } as const;
  const guests = report?.rows.filter((r) => !r.userId) ?? [];
  // Base do gráfico de desempenho: média de cada um nos outros mixes (falha = sem o tracinho).
  const averages = report?.rows.length
    ? await playerAverages(
        mix.id,
        report.rows.map((r) => r.userId).filter((id): id is string => !!id),
      ).catch(() => ({}))
    : {};
  const { session, canManageMixes } = await getPermissions();
  const canSendClip = kind === "supabase" && !!session;
  const playerIds = [...new Set([...mix.teams[0].playerIds, ...mix.teams[1].playerIds])];
  // Lives e gravações da Twitch dos jogadores deste mix.
  const broadcasts = kind === "supabase" ? await mixBroadcasts(mix.scheduledAt, playerIds) : [];
  const streams = toStreamItems(broadcasts, players);
  // Perfil Allstar (pelo SteamID64) de quem jogou este mix, para achar os clipes da data.
  const allstarLinks = playerIds
    .map((id) => players.get(id))
    .flatMap((p) => {
      const url = p ? allstarProfileUrl(p.steamId) : null;
      return p && url ? [{ name: p.nickname, url }] : [];
    })
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const clips = toClipViews(highlights, {
    players,
    mixes: new Map([[mix.id, mix]]),
    viewerId: session?.id ?? null,
    canManage: canManageMixes,
  });
  const linked = new Set(report?.rows.map((r) => r.userId).filter(Boolean));
  const linkable =
    canManageMixes && guests.length
      ? (await getDataSource().listPlayers())
          .filter((p) => !linked.has(p.id))
          .map((p) => ({ id: p.id, name: p.nickname }))
          .sort((a, b) => a.name.localeCompare(b.name))
      : [];

  const score = seriesScore(mix);
  const winner = seriesWinner(mix);
  const finished = mix.status === "finished";
  // Série empatada (ex.: 2×2 em 4 mapas): painel em cinza.
  const draw = finished && !winner && !!score;

  const streamsCard =
    streams.length > 0 ? (
      <TwitchStreams
        title={streams.some((s) => s.live) ? "Ao vivo na Twitch" : "Transmissões"}
        description={`${streams.length} ${streams.length > 1 ? "canais" : "canal"} de jogadores deste mix`}
        items={streams}
        footnote={
          streams.some((s) => !s.live && !s.meta.startsWith("Destaque"))
            ? "A Twitch apaga as gravações depois de 7 dias (60 para Partner, Turbo ou Prime). Para guardar, o streamer transforma a gravação em Destaque."
            : undefined
        }
      />
    ) : null;

  return (
    <>
      <Button variant="ghost" size="sm" className="mb-3 -ml-2" asChild>
        <Link href="/mixes">
          <ArrowLeft /> Mixes
        </Link>
      </Button>
      <PageHeader
        title={mix.name}
        description={formatDateTime(mix.scheduledAt)}
        actions={
          <>
            {report?.rows.length ? (
              <ShareResult matchId={mix.id} fileName={`meumix-${mix.scheduledAt.slice(0, 10)}.png`} />
            ) : null}
            {canManageMixes && report && <EditMatchDate matchId={mix.id} date={mix.scheduledAt.slice(0, 10)} />}
            {canManageMixes && report && <DeleteMatchButton matchId={mix.id} label={mix.name} redirectTo="/mixes" />}
            <DemoBadge kind={kind} />
            <StatusBadge status={mix.status} />
          </>
        }
      />

      {/* Placar geral */}
      <Card className="mb-4 overflow-hidden">
        <div
          className={cn(
            "grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-5 sm:px-8",
            // Vencedor em verde, perdedor em vermelho.
            winner === "A" && "bg-gradient-to-r from-win/20 via-transparent to-loss/20",
            winner === "B" && "bg-gradient-to-r from-loss/20 via-transparent to-win/20",
            draw && "bg-gradient-to-r from-surface-3/80 via-transparent to-surface-3/80",
          )}
        >
          {mix.teams.map((team, i) => (
            <div
              key={team.side}
              className={cn("min-w-0", i === 0 ? "col-start-1 text-left" : "col-start-3 text-right")}
            >
              <div className={cn("flex items-center gap-2", i === 1 && "justify-end")}>
                <TeamDot side={team.side} />
                <span
                  className={cn(
                    "truncate font-display text-base font-bold uppercase sm:text-lg",
                    winner && winner !== team.side && "text-muted",
                  )}
                >
                  {team.name}
                </span>
              </div>
              <div className="mt-0.5 text-xs text-muted">
                {winner && (
                  <span className={cn("font-semibold", winner === team.side ? "text-win" : "text-loss")}>
                    {winner === team.side ? "Vencedor" : "Derrota"} ·{" "}
                  </span>
                )}
                {draw && <span className="font-semibold text-muted">Empate · </span>}
                {team.playerIds.length} jogadores
              </div>
              {/* Fotos dos jogadores do time, pequenas (MVP primeiro, na ordem da pontuação do mix). */}
              <div className={cn("mt-2 flex -space-x-1.5 sm:gap-1 sm:space-x-0", i === 1 && "justify-end")}>
                {(report?.rows.length
                  ? [...report.rows]
                      .filter((r) => r.team === team.side)
                      .sort(byMixScore)
                      .map((r) => ({ key: r.key, name: r.name, avatarUrl: r.avatarUrl }))
                  : team.playerIds.map((id) => {
                      const p = players.get(id);
                      return { key: id, name: p?.nickname ?? "Jogador", avatarUrl: p?.avatarUrl ?? null };
                    })
                ).map((p) => (
                  <span key={p.key} title={p.name}>
                    <Avatar name={p.name} src={p.avatarUrl} size="xs" className="opacity-90 ring-2 ring-surface" />
                  </span>
                ))}
              </div>
            </div>
          ))}
          <div className="col-start-2 row-start-1 text-center">
            {score ? (
              <div className="font-display text-3xl font-bold tabular sm:text-4xl">
                <span className={winner ? (winner === "A" ? "text-win" : "text-loss") : "text-muted"}>{score[0]}</span>
                <span className="mx-2 text-subtle">:</span>
                <span className={winner ? (winner === "B" ? "text-win" : "text-loss") : "text-muted"}>{score[1]}</span>
              </div>
            ) : (
              <span className="text-sm text-muted">vs</span>
            )}
            <div className="mt-1 text-[11px] tracking-wider text-subtle uppercase">
              {mix.maps.length > 1 ? `Melhor de ${mix.maps.length}` : "Mapa único"}
            </div>
          </div>
        </div>
        {/* Mapas lado a lado (geralmente 3 ou 4): emblema no círculo, placar e os rounds embaixo (dados da GC). */}
        <ul
          className={cn(
            // Linhas entre os mapas: o fundo da grade aparece no espaço de 1px entre eles.
            "grid gap-px border-t border-border bg-border",
            mix.maps.length === 2 && "sm:grid-cols-2",
            mix.maps.length === 3 && "sm:grid-cols-3",
            // 4 mapas: 2×2 no tablet e uma linha só na tela grande.
            mix.maps.length === 4 && "sm:grid-cols-2 xl:grid-cols-4",
            mix.maps.length >= 5 && "xl:grid-cols-5",
          )}
        >
          {mix.maps.map((m, i) => (
            <li key={m.order} className="flex min-w-0 items-center gap-3 bg-surface px-4 py-2.5 sm:py-3">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-surface-3 to-surface-2 ring-2 ring-brand/80 ring-offset-2 ring-offset-surface">
                <MapIcon id={m.mapId} size={34} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-display text-sm font-bold tracking-wide uppercase">{mapName(m.mapId)}</div>
                {m.scoreA != null && m.scoreB != null ? (
                  <div className="font-display text-lg leading-tight font-bold text-muted tabular">
                    <span className={m.winner === "A" ? "text-brand" : ""}>{m.scoreA}</span>
                    <span className="mx-1 text-subtle">–</span>
                    <span className={m.winner === "B" ? "text-brand" : ""}>{m.scoreB}</span>
                  </div>
                ) : (
                  <div className="text-xs text-subtle">a jogar</div>
                )}
                {gcMaps[i] && <RoundDots map={gcMaps[i]} teams={[mix.teams[0].name, mix.teams[1].name]} compact />}
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {/* Sem as estatísticas, as transmissões ficam aqui; com elas, abaixo do Desempenho no mix. */}
      {!report?.rows.length && streamsCard && <div className="mb-4">{streamsCard}</div>}

      {/* Com o placar completo, a tabela usa a largura toda e o painel lateral vai para baixo. */}
      <div className={cn("grid gap-4", !report?.rows.length && "xl:grid-cols-[1fr_18rem]")}>
        <div className="min-w-0 space-y-4">
          {report?.rows.length ? (
            <>
              <Card className="overflow-hidden">
                <div className="border-b border-border bg-gradient-to-r from-win/10 to-transparent px-4 py-4">
                  <div className="flex items-center gap-2">
                    <h2 className="font-display text-xl font-bold">Estatísticas dos jogadores</h2>
                    <Badge variant="neutral">{PLATFORM[report.platform]}</Badge>
                  </div>
                  <p className="mt-0.5 text-sm text-muted">
                    {mix.maps.length > 1
                      ? `Estatísticas agregadas dos ${mix.maps.length} mapas enviados`
                      : `Estatísticas de ${mapName(mix.maps[0]!.mapId)}`}
                  </p>
                </div>
                <MatchStatsTable rows={report.rows} gcMaps={gcMaps} />
              </Card>
              {canManageMixes && guests.length > 0 && (
                <LinkGuests
                  matchId={mix.id}
                  guests={guests.map((g) => ({ recordId: g.key, name: g.name, rp: g.rp }))}
                  profiles={linkable}
                />
              )}
              <MatchHighlights rows={report.rows} gc={gcMaps} />
              <Card>
                <CardHeader
                  title="Desempenho no mix"
                  description="Quem mais jogou acima da própria média aparece primeiro."
                />
                <CardContent>
                  <MatchPerformance
                    rows={report.rows}
                    averages={averages}
                    teamNames={[mix.teams[0].name, mix.teams[1].name]}
                    gcNow={Object.fromEntries(
                      aggregateGc(gcMaps)
                        .filter((l) => l.userId)
                        .map((l) => [l.userId!, { rating: l.rating, swing: l.swing }]),
                    )}
                  />
                </CardContent>
              </Card>
              {gcMaps.length > 0 && (
                <Card>
                  <CardHeader
                    title="Análise da partida"
                    description="Jogador por jogador: o que os números da GC mostram, uma dica para o próximo mix e a resenha."
                    action={canManageMixes && <GenerateAnalysis matchId={mix.id} hasAi={!!aiAnalysis} />}
                  />
                  <CardContent>
                    <MatchAnalysis
                      teams={matchAnalysis(gcMaps, {
                        winner,
                        names: Object.fromEntries(report.rows.filter((r) => r.userId).map((r) => [r.userId!, r.name])),
                        mapName: (id) => mapName(id as MapId),
                        ai: aiAnalysis?.content,
                      })}
                      ai={!!aiAnalysis}
                      teamNames={[mix.teams[0].name, mix.teams[1].name]}
                      avatars={Object.fromEntries(
                        report.rows.filter((r) => r.userId).map((r) => [r.userId!, r.avatarUrl]),
                      )}
                    />
                  </CardContent>
                </Card>
              )}
              {streamsCard}
              {/* Mix da GC: a resenha de cada jogador já está na Análise da partida. */}
              {gcMaps.length === 0 && (
                <ChronicleCard
                  matchId={mix.id}
                  canManage={canManageMixes}
                  meta={{
                    date: mix.scheduledAt.slice(0, 10),
                    teams: { A: mix.teams[0].name, B: mix.teams[1].name },
                    maps: mix.maps.map((m) => ({ name: mapName(m.mapId), scoreA: m.scoreA, scoreB: m.scoreB })),
                  }}
                />
              )}
              <BolaoResult matchId={mix.id} />
            </>
          ) : finished ? (
            <>
              <Card>
                <CardHeader
                  title="Estatísticas da partida"
                  description={mix.maps.length > 1 ? "Somatório de todos os mapas" : mapName(mix.maps[0]!.mapId)}
                />
                <CardContent>
                  <Scoreboard rows={scoreboard} teams={mix.teams} mvpId={mix.mvpPlayerId} score={score ?? undefined} />
                  <p className="mt-3 text-xs text-subtle">“—” indica métrica não registrada para esta partida.</p>
                </CardContent>
              </Card>
              {mapScoreboards.length > 1 &&
                mapScoreboards
                  .filter((s) => s.rows.length)
                  .map(({ map, rows }) => (
                    <Card key={map.order}>
                      <CardHeader
                        title={
                          <span className="flex items-center gap-2">
                            <MapIcon id={map.mapId} size={22} />
                            Mapa {map.order} · {mapName(map.mapId)}
                          </span>
                        }
                      />
                      <CardContent>
                        <Scoreboard rows={rows} teams={mix.teams} mvpId={null} score={[map.scoreA, map.scoreB]} />
                      </CardContent>
                    </Card>
                  ))}
            </>
          ) : (
            <Card>
              <CardHeader title="Equipes" />
              <div className="grid gap-px bg-border sm:grid-cols-2">
                {mix.teams.map((team) => (
                  <div key={team.side} className="bg-surface p-4">
                    <div className="mb-3 flex items-center gap-2 font-display text-sm font-semibold uppercase">
                      <TeamDot side={team.side} /> {team.name}
                    </div>
                    <ul className="space-y-2">
                      {team.playerIds.map((id) => {
                        const p = players.get(id);
                        return p ? (
                          <li key={id}>
                            <PlayerLink player={p} />
                          </li>
                        ) : null;
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        <aside className="space-y-4">
          <Card>
            <CardHeader
              title="Clipes e highlights"
              action={
                canSendClip && (
                  <div className="flex flex-wrap gap-2">
                    {canManageMixes && <ImportTwitchButton matchId={mix.id} />}
                    {canManageMixes && <ImportAllstarDialog matchId={mix.id} />}
                    <AddClipDialog
                      currentUserId={session!.id}
                      defaultMixId={mix.id}
                      mixes={[{ id: mix.id, label: mix.name }]}
                      players={
                        canManageMixes
                          ? [...players.values()]
                              .map((p) => ({ id: p.id, label: p.nickname }))
                              .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"))
                          : null
                      }
                    />
                  </div>
                )
              }
            />
            {clips.length ? (
              <ul className="space-y-3 p-4 pt-0">
                {clips.map((c) => (
                  <li key={c.id}>
                    <ClipCard clip={{ ...c, mix: null }} />
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={Clapperboard}
                title="Nenhum clipe"
                description="Clipes desta partida (Allstar e Twitch) aparecerão aqui."
                className="py-8"
              />
            )}
            {allstarLinks.length > 0 && (
              <div className="border-t border-border px-4 py-3">
                <p className="mb-2 text-xs text-muted">
                  Procure os clipes de {formatDateTime(mix.scheduledAt)} no Allstar de cada jogador:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {allstarLinks.map((l) => (
                    <a
                      key={l.url}
                      href={l.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-2 px-2 py-1 text-xs text-fg transition-colors hover:border-brand/50 hover:text-brand"
                    >
                      {l.name} <ExternalLink className="size-3" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </aside>
      </div>
    </>
  );
}
