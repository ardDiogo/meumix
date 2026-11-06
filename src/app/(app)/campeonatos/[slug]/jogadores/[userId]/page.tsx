import { Crown } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TeamLogo } from "@/components/championships/team-logo";
import { MapIcon } from "@/components/maps/map-icon";
import { StatCard } from "@/components/stats/stat-card";
import { Avatar } from "@/components/ui/avatar";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { playoffLabel } from "@/lib/championship-playoffs";
import { kdOf } from "@/lib/championship-stats";
import { aggregateGc } from "@/lib/gc-analysis";
import { mapName } from "@/lib/maps";
import { playerHref } from "@/lib/player-slug";
import { cn } from "@/lib/utils";
import type { MapId } from "@/types/domain";
import { getChampionship } from "@/services/championships";
import { getSummary } from "@/services/championship-summary";

export const metadata = { title: "Jogador no campeonato" };

const dec = (n: number | null, d = 2) =>
  n == null ? "-" : n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

/** O jogador neste campeonato: equipe, partidas, números e histórico mapa a mapa (só dados do campeonato). */
export default async function ChampionshipPlayerPage({ params }: PageProps<"/campeonatos/[slug]/jogadores/[userId]">) {
  const { slug, userId } = await params;
  const data = await getChampionship(slug);
  if (!data) notFound();
  const { championship: c, players: all } = data;
  const s = await getSummary(c);
  const entry = s.players.find((p) => p.userId === userId);
  const profile = all.find((p) => p.id === userId);
  if (!entry || !profile) notFound();
  const team = s.teams.find((t) => t.id === entry.teamId) ?? null;
  const mine = s.gc.map((g) => ({ ...g, me: g.data.players.find((p) => p.userId === userId) })).filter((g) => g.me);
  const line = aggregateGc(mine.map((g) => g.data)).find((l) => l.userId === userId) ?? null;
  // Partidas (séries) em que jogou e o resultado do time.
  const matchIds = [...new Set(mine.map((g) => g.matchId))];
  const series = matchIds.map((id) => s.matches.find((m) => m.id === id)!).filter(Boolean);
  const wins = series.filter((m) => m.winnerTeam && m.winnerTeam === team?.id).length;
  const losses = series.filter((m) => m.winnerTeam && m.winnerTeam !== team?.id).length;
  const teamName = (id: string | null) => s.teams.find((t) => t.id === id)?.name ?? "A definir";

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        {team && <div className="h-1" style={{ background: team.color }} />}
        <div className="flex flex-wrap items-center gap-4 px-5 py-4">
          <Avatar name={profile.nickname} src={profile.avatarUrl} size="xl" className="rounded-xl" />
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-2xl font-bold">{profile.nickname}</h2>
            {team ? (
              <div className="mt-1 flex items-center gap-2 text-sm text-muted">
                <TeamLogo team={team} size={22} /> {team.name}
                {team.captainId === userId && (
                  <span className="flex items-center gap-1 text-xs font-semibold text-brand">
                    <Crown className="size-3.5" aria-hidden /> Capitão
                  </span>
                )}
                {entry.pot && <span className="text-xs text-subtle">· pote {entry.pot}</span>}
              </div>
            ) : (
              <div className="mt-1 text-sm text-muted">Inscrito, ainda sem equipe</div>
            )}
          </div>
          <Link href={playerHref(profile)} className="text-sm text-muted hover:text-brand">
            Perfil no MeuMix →
          </Link>
        </div>
      </Card>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        <StatCard label="Partidas" value={String(series.length)} />
        <StatCard label="Vitórias" value={String(wins)} />
        <StatCard label="Derrotas" value={String(losses)} />
        <StatCard label="Rating" value={dec(line?.rating ?? null)} accent />
        <StatCard label="Kills" value={String(line?.k ?? 0)} />
        <StatCard label="Mortes" value={String(line?.d ?? 0)} />
        <StatCard label="K/D" value={line ? dec(kdOf(line)) : "-"} />
        <StatCard label="ADR" value={dec(line?.adr ?? null, 1)} />
      </section>

      <Card className="overflow-hidden">
        <CardHeader
          title="Histórico de desempenho"
          description={`${mine.length} ${mine.length === 1 ? "mapa" : "mapas"} importados da GC · ${line?.a ?? 0} assistências`}
        />
        {mine.length === 0 ? (
          <EmptyState
            icon={Crown}
            title="Nenhum mapa ainda"
            description="Aparece aqui quando os jogos forem importados da GC."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-xs font-semibold text-muted">
                  <th className="px-4 py-2.5 text-left">Jogo</th>
                  <th className="px-2 py-2.5 text-left">Mapa</th>
                  <th className="px-2 py-2.5 text-center">Placar</th>
                  <th className="px-2 py-2.5 text-center">K/A/D</th>
                  <th className="px-2 py-2.5 text-center">ADR</th>
                  <th className="px-4 py-2.5 text-center">Rating</th>
                </tr>
              </thead>
              <tbody>
                {mine.map((g) => {
                  const m = s.matches.find((x) => x.id === g.matchId);
                  const home = g.me!.team === "A";
                  const my = home ? g.data.scoreA : g.data.scoreB;
                  const their = home ? g.data.scoreB : g.data.scoreA;
                  const opp = m ? (home ? m.awayTeam : m.homeTeam) : null;
                  return (
                    <tr key={`${g.matchId}-${g.order}`} className="border-b border-border last:border-0">
                      <td className="px-4 py-2">
                        <Link href={`/campeonatos/${c.slug}/jogos/${g.matchId}`} className="hover:text-brand">
                          <span className="text-xs text-subtle">
                            {m?.stage === "playoff"
                              ? playoffLabel(c.playoffFormat, m.round, m.leg)
                              : `Rodada ${m?.round}`}
                          </span>{" "}
                          <span className="font-medium">vs {teamName(opp)}</span>
                        </Link>
                      </td>
                      <td className="px-2 py-2">
                        <span className="flex items-center gap-2">
                          <MapIcon id={g.data.mapId as MapId} size={18} /> {mapName(g.data.mapId as MapId)}
                        </span>
                      </td>
                      <td
                        className={cn(
                          "px-2 py-2 text-center font-semibold tabular",
                          my > their ? "text-win" : "text-loss",
                        )}
                      >
                        {my}–{their}
                      </td>
                      <td className="px-2 py-2 text-center tabular">
                        {g.me!.k}/{g.me!.a}/{g.me!.d}
                      </td>
                      <td className="px-2 py-2 text-center tabular">{dec(g.me!.adr, 1)}</td>
                      <td className="px-4 py-2 text-center font-display font-bold tabular">{dec(g.me!.rating)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
