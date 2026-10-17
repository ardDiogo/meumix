import { ArrowLeft, CalendarClock, Clapperboard, ExternalLink, Trophy, Tv, Users } from "lucide-react";
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
import { getMatchReport } from "@/services/match-report";
import { MatchHighlights } from "@/components/mixes/match-highlights";
import { MatchStatsTable } from "@/components/mixes/match-stats-table";
import { LinkGuests } from "@/components/mixes/link-guests";
import { ShareResult } from "@/components/mixes/share-result";
import { DeleteMatchButton } from "@/components/mixes/delete-match-button";
import { EditMatchDate } from "@/components/mixes/edit-match-date";
import { getPermissions } from "@/services/auth";
import { getDataSource } from "@/services";
import { Badge } from "@/components/ui/badge";
import { AddClipDialog } from "@/components/clips/add-clip-dialog";
import { ClipCard } from "@/components/clips/clip-card";
import { toClipViews } from "@/services/clips";
import { allstarProfileUrl } from "@/lib/allstar";

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
  const report = kind === "supabase" && mix.status === "finished" ? await getMatchReport(mix.id) : null;
  const PLATFORM = { gc: "GC", faceit: "Faceit", manual: "Manual" } as const;
  const guests = report?.rows.filter((r) => !r.userId) ?? [];
  const { session, canManageMixes } = await getPermissions();
  const canSendClip = kind === "supabase" && !!session;
  // Perfil Allstar (pelo SteamID64) de quem jogou este mix, para achar os clipes da data.
  const allstarLinks = [...new Set([...mix.teams[0].playerIds, ...mix.teams[1].playerIds])]
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
  const mvp = mix.mvpPlayerId ? players.get(mix.mvpPlayerId) : undefined;
  const organizers = mix.organizerIds.map((id) => players.get(id)).filter((p) => p != null);
  const finished = mix.status === "finished";
  // Série empatada (ex.: 2×2 em 4 mapas): painel em cinza.
  const draw = finished && !winner && !!score;

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
              <ShareResult
                matchId={mix.id}
                fileName={`meumix-${mix.scheduledAt.slice(0, 10)}.png`}
                text={`🏆 ${mix.name}: ${mix.teams[0].name} ${score?.[0] ?? 0} x ${score?.[1] ?? 0} ${mix.teams[1].name}${
                  winner ? ` — vitória do ${mix.teams[winner === "A" ? 0 : 1].name}` : " — empate"
                }`}
              />
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
        <ul className="flex flex-wrap gap-2 border-t border-border px-4 py-3">
          {mix.maps.map((m) => (
            <li
              key={m.order}
              className="flex items-center gap-2 rounded-md border border-border bg-surface-2 px-3 py-1.5 text-sm"
            >
              <span className="font-medium">{mapName(m.mapId)}</span>
              {m.scoreA != null && m.scoreB != null ? (
                <span className="text-muted tabular">
                  <span className={m.winner === "A" ? "text-fg" : ""}>{m.scoreA}</span>–
                  <span className={m.winner === "B" ? "text-fg" : ""}>{m.scoreB}</span>
                </span>
              ) : (
                <span className="text-xs text-subtle">a jogar</span>
              )}
            </li>
          ))}
        </ul>
      </Card>

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
                <MatchStatsTable rows={report.rows} />
              </Card>
              {canManageMixes && guests.length > 0 && (
                <LinkGuests
                  matchId={mix.id}
                  guests={guests.map((g) => ({ recordId: g.key, name: g.name, rp: g.rp }))}
                  profiles={linkable}
                />
              )}
              <MatchHighlights rows={report.rows} />
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
                      <CardHeader title={`Mapa ${map.order} · ${mapName(map.mapId)}`} />
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

        <aside className={cn(report?.rows.length ? "grid items-start gap-4 md:grid-cols-2" : "space-y-4")}>
          <Card>
            <CardHeader title="Informações" />
            <dl className="divide-y divide-border text-sm">
              <InfoRow icon={Trophy} label="MVP">
                {mvp ? (
                  <PlayerLink player={mvp} highlight />
                ) : (
                  <span className="text-muted">{finished ? "Não definido" : "Após a partida"}</span>
                )}
              </InfoRow>
              <InfoRow icon={CalendarClock} label="Data">
                {formatDateTime(mix.scheduledAt)}
              </InfoRow>
              <InfoRow icon={Users} label="Organização">
                {organizers.length ? (
                  <div className="flex flex-col gap-1.5">
                    {organizers.map((p) => (
                      <PlayerLink key={p.id} player={p} />
                    ))}
                  </div>
                ) : (
                  <span className="text-muted">—</span>
                )}
              </InfoRow>
              <InfoRow icon={Tv} label="Transmissão">
                {mix.twitchUrl ? (
                  <a
                    href={mix.twitchUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-brand hover:underline"
                  >
                    Twitch <ExternalLink className="size-3" />
                  </a>
                ) : (
                  <span className="text-muted">Sem transmissão vinculada</span>
                )}
              </InfoRow>
            </dl>
          </Card>

          <Card>
            <CardHeader
              title="Clipes e highlights"
              action={
                canSendClip && (
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
                description="Clipes desta partida (Allstar) aparecerão aqui."
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

function InfoRow({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-subtle" />
      <div className="min-w-0 flex-1">
        <dt className="text-[11px] font-semibold tracking-wider text-muted uppercase">{label}</dt>
        <dd className="mt-0.5">{children}</dd>
      </div>
    </div>
  );
}
