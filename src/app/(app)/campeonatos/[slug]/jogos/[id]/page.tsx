import { CalendarClock, Crown, Server } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ResultManager } from "@/components/championships/result-manager";
import { TeamLogo } from "@/components/championships/team-logo";
import { MapIcon } from "@/components/maps/map-icon";
import { PlayerLink } from "@/components/players/player-link";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { formatWhen, MATCH_STATUS_LABEL } from "@/lib/championship-schedule";
import { seriesState } from "@/lib/championship-standings";
import { aggregateGc } from "@/lib/gc-analysis";
import { MAPS, mapName } from "@/lib/maps";
import { cn } from "@/lib/utils";
import type { MapId, Player } from "@/types/domain";
import { getChampionship, getMapResults, getMatches, getMatchGcMaps, getRoster } from "@/services/championships";

export const metadata = { title: "Jogo do campeonato" };

const fmt = (n: number | null, d = 0) =>
  n == null ? "-" : n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

/** Página do confronto: times, elencos, mapas, data, servidor, status e resultado. */
export default async function MatchPage({ params }: PageProps<"/campeonatos/[slug]/jogos/[id]">) {
  const { slug, id } = await params;
  const data = await getChampionship(slug);
  if (!data) notFound();
  const { championship: c, canManage, players: all } = data;
  const [{ teams, players }, { matches }, { maps }, gcMaps] = await Promise.all([
    getRoster(c.id),
    getMatches(c.id),
    getMapResults(c.id),
    getMatchGcMaps(id),
  ]);
  const m = matches.find((x) => x.id === id);
  if (!m) notFound();
  const home = teams.find((t) => t.id === m.homeTeam);
  const away = teams.find((t) => t.id === m.awayTeam);
  const myMaps = maps.filter((x) => x.matchId === m.id).sort((a, b) => a.order - b.order);
  const state = seriesState(myMaps, m.bestOf);
  // MD1: o placar do topo é o de rounds (13:5); MD3/MD5: mapas vencidos.
  const shown = m.bestOf === 1 && myMaps[0] ? { home: myMaps[0].home, away: myMaps[0].away } : state;
  const byId = new Map(all.map((p) => [p.id, p]));
  const asPlayer = (uid: string): Player =>
    byId.get(uid) ?? { id: uid, nickname: "Jogador", avatarUrl: null, steamId: null, createdAt: "" };
  const lines = aggregateGc(gcMaps);
  const statOf = (uid: string) => lines.find((l) => l.userId === uid);

  const side = (team: typeof home, won: boolean, right = false) => (
    <div className={cn("flex min-w-0 flex-1 flex-col items-center gap-2 text-center", right && "sm:items-center")}>
      {team ? (
        <TeamLogo team={team} size={64} />
      ) : (
        <div className="size-16 rounded-lg border border-dashed border-border" />
      )}
      <span className={cn("truncate font-display text-lg font-bold", m.winnerTeam && !won && "text-muted")}>
        {team?.name ?? "A definir"}
      </span>
    </div>
  );

  const roster = (team: typeof home) => {
    if (!team) return null;
    const list = players
      .filter((p) => p.teamId === team.id)
      .sort((a, b) => Number(b.userId === team.captainId) - Number(a.userId === team.captainId));
    return (
      <Card className="overflow-hidden">
        <div className="h-1" style={{ background: team.color }} />
        <CardHeader title={team.name} />
        <table className="w-full text-sm">
          {lines.length > 0 && (
            <thead>
              <tr className="border-b border-border text-xs text-muted">
                <th className="px-4 py-2 text-left font-semibold">Jogador</th>
                <th className="px-2 py-2 text-center font-semibold">K/A/D</th>
                <th className="px-2 py-2 text-center font-semibold">ADR</th>
                <th className="px-3 py-2 text-center font-semibold">Rating</th>
              </tr>
            </thead>
          )}
          <tbody>
            {list.map((p) => {
              const s = statOf(p.userId);
              return (
                <tr key={p.userId} className="border-b border-border last:border-0">
                  <td className="px-4 py-2">
                    <span className="flex items-center gap-2">
                      <PlayerLink player={asPlayer(p.userId)} size="xs" className="min-w-0" />
                      {p.userId === team.captainId && (
                        <Crown className="size-3.5 shrink-0 text-brand" aria-label="Capitão" />
                      )}
                    </span>
                  </td>
                  {lines.length > 0 && (
                    <>
                      <td className="px-2 py-2 text-center tabular">{s ? `${s.k}/${s.a}/${s.d}` : "-"}</td>
                      <td className="px-2 py-2 text-center tabular">{fmt(s?.adr ?? null, 1)}</td>
                      <td className="px-3 py-2 text-center font-semibold tabular">{fmt(s?.rating ?? null, 2)}</td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    );
  };

  return (
    <div className="space-y-4">
      <Link href={`/campeonatos/${slug}/calendario`} className="text-sm text-muted hover:text-fg">
        ← Calendário
      </Link>
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-center gap-2 border-b border-border px-4 py-2.5 text-xs text-muted">
          <span className="font-semibold tracking-wider uppercase">
            {m.stage === "group" ? `Rodada ${m.round}` : "Playoffs"} · MD{m.bestOf}
          </span>
          <Badge
            variant={
              m.status === "finished" ? "neutral" : m.status === "scheduled" || m.status === "live" ? "win" : "brand"
            }
          >
            {MATCH_STATUS_LABEL[m.status]}
          </Badge>
        </div>
        <div className="flex items-center gap-4 px-4 py-6 sm:px-10">
          {side(home, m.winnerTeam === home?.id)}
          <div className="text-center">
            <div className="font-display text-4xl font-bold tabular sm:text-5xl">
              {myMaps.length ? (
                <>
                  <span className={state.winner === "home" ? "text-win" : state.winner ? "text-loss" : ""}>
                    {shown.home}
                  </span>
                  <span className="mx-2 text-subtle">:</span>
                  <span className={state.winner === "away" ? "text-win" : state.winner ? "text-loss" : ""}>
                    {shown.away}
                  </span>
                </>
              ) : (
                <span className="text-subtle">×</span>
              )}
            </div>
            {myMaps.length > 0 && m.bestOf > 1 && <div className="text-xs text-muted">mapas</div>}
          </div>
          {side(away, m.winnerTeam === away?.id, true)}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 border-t border-border px-4 py-2.5 text-sm text-muted">
          <span className="flex items-center gap-1.5">
            <CalendarClock className="size-4 text-brand" aria-hidden />
            {m.scheduledAt && ["approval", "scheduled", "live", "finished"].includes(m.status)
              ? formatWhen(m.scheduledAt)
              : "Data a combinar"}
          </span>
          {m.server && (
            <span className="flex items-center gap-1.5">
              <Server className="size-4 text-brand" aria-hidden /> Servidor {m.server}
            </span>
          )}
          <span>
            Capitães:{" "}
            {[home, away].map((t) => (t?.captainId ? (byId.get(t.captainId)?.nickname ?? "?") : "-")).join(" e ")}
          </span>
        </div>
        {myMaps.length > 0 && (
          <ul className="divide-y divide-border border-t border-border">
            {myMaps.map((x) => (
              <li key={x.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <MapIcon id={x.mapId as MapId} size={22} />
                <span className="flex-1 font-medium">{mapName(x.mapId as MapId)}</span>
                <span className="font-display text-base font-bold tabular">
                  <span className={x.home > x.away ? "text-win" : "text-muted"}>{x.home}</span>
                  <span className="mx-1 text-subtle">–</span>
                  <span className={x.away > x.home ? "text-win" : "text-muted"}>{x.away}</span>
                </span>
                {x.gcMatchId && <span className="text-xs text-subtle">GC #{x.gcMatchId}</span>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {canManage && home && away && (
        <ResultManager
          championshipId={c.id}
          matchId={m.id}
          bestOf={m.bestOf}
          status={m.status}
          maps={myMaps.map((x) => ({
            order: x.order,
            mapId: x.mapId,
            home: x.home,
            away: x.away,
            gcMatchId: x.gcMatchId,
          }))}
          homeName={home.name}
          awayName={away.name}
          mapOptions={Object.values(MAPS).map((x) => ({ id: x.id, name: x.name }))}
        />
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {roster(home)}
        {roster(away)}
      </div>
    </div>
  );
}
