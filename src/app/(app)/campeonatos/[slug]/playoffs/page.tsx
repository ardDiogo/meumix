import { Trophy } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GeneratePlayoffs } from "@/components/championships/generate-playoffs";
import { TeamLogo } from "@/components/championships/team-logo";
import { Card, CardContent } from "@/components/ui/card";
import { PLAYOFF_TEAMS } from "@/lib/championship";
import { playoffLabel, playoffRounds, roundTitle } from "@/lib/championship-playoffs";
import { formatWhen, MATCH_STATUS_LABEL } from "@/lib/championship-schedule";
import { seriesState, standings } from "@/lib/championship-standings";
import { cn } from "@/lib/utils";
import { getChampionship, getMapResults, getMatches, getRoster, type MatchRow } from "@/services/championships";

export const metadata = { title: "Playoffs do campeonato" };

/** Chave dos playoffs: fases lado a lado, placares, mapas e o campeão em destaque. */
export default async function PlayoffsPage({ params }: PageProps<"/campeonatos/[slug]/playoffs">) {
  const data = await getChampionship((await params).slug);
  if (!data) notFound();
  const { championship: c, canManage } = data;
  const [{ teams }, { matches }, { maps }] = await Promise.all([
    getRoster(c.id),
    getMatches(c.id),
    getMapResults(c.id),
  ]);
  const byId = new Map(teams.map((t) => [t.id, t]));
  const group = matches.filter((m) => m.stage === "group");
  const playoffs = matches.filter((m) => m.stage === "playoff");
  const totalRounds = playoffRounds(c.playoffFormat);
  const groupOpen = group.filter((m) => m.status !== "finished" && m.status !== "cancelled").length;
  const hasResults = playoffs.some((m) => maps.some((x) => x.matchId === m.id));
  const final = playoffs.find((m) => m.round === totalRounds);
  const champion = final?.winnerTeam ? byId.get(final.winnerTeam) : null;
  const runnerUp = final?.winnerTeam
    ? byId.get(final.winnerTeam === final.homeTeam ? final.awayTeam! : final.homeTeam!)
    : null;
  // Colocação na fase classificatória (para mostrar a semente).
  const seedOf = new Map(
    standings(
      teams.map((t) => t.id),
      group.map((m) => ({
        home: m.homeTeam!,
        away: m.awayTeam!,
        bestOf: m.bestOf,
        maps: maps.filter((x) => x.matchId === m.id).map((x) => ({ home: x.home, away: x.away })),
      })),
      { pointsWin: c.pointsWin, pointsLoss: c.pointsLoss },
    ).map((r, i) => [r.team, i + 1]),
  );

  if (c.playoffFormat === "none")
    return (
      <Card className="p-6 text-center text-sm text-muted">
        Este campeonato não tem playoffs: vale a classificação.
      </Card>
    );

  const slot = (m: MatchRow, side: "home" | "away") => {
    const id = side === "home" ? m.homeTeam : m.awayTeam;
    const t = id ? byId.get(id) : null;
    const mine = maps.filter((x) => x.matchId === m.id);
    const s = seriesState(mine, m.bestOf);
    const won = !!m.winnerTeam && m.winnerTeam === id;
    const lost = !!m.winnerTeam && !!id && m.winnerTeam !== id;
    return (
      <div className={cn("flex items-center gap-2 px-3 py-2", won && "bg-win/[0.07]")}>
        {t ? (
          <TeamLogo team={t} size={24} />
        ) : (
          <span className="size-6 rounded-md border border-dashed border-border" />
        )}
        {t && seedOf.get(t.id) && <span className="w-4 text-[11px] text-subtle tabular">{seedOf.get(t.id)}º</span>}
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-sm font-semibold",
            lost && "text-muted",
            !t && "font-normal text-subtle",
          )}
        >
          {t?.name ?? "A definir"}
        </span>
        {mine.length > 0 && (
          <span className={cn("font-display text-base font-bold tabular", won ? "text-win" : "text-muted")}>
            {side === "home" ? s.home : s.away}
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {champion && (
        <Card className="overflow-hidden border-brand/60 shadow-[0_0_40px_-12px] shadow-brand/60">
          <div className="flex flex-wrap items-center gap-4 bg-gradient-to-r from-brand/25 via-brand/5 to-transparent px-5 py-5">
            <Trophy className="size-10 shrink-0 text-brand" aria-hidden />
            <TeamLogo team={champion} size={56} />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold tracking-[0.25em] text-brand uppercase">Campeão</div>
              <div className="truncate font-display text-2xl font-bold">{champion.name}</div>
              {runnerUp && <div className="text-sm text-muted">Vice: {runnerUp.name}</div>}
            </div>
          </div>
        </Card>
      )}

      {canManage && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <span className="text-muted">
              {playoffs.length
                ? hasResults
                  ? "Chave em andamento: os vencedores avançam sozinhos quando o resultado entra."
                  : "Chave gerada pela classificação. Dá para refazer enquanto não houver resultado."
                : groupOpen
                  ? `A chave sai quando a fase classificatória terminar (faltam ${groupOpen} ${groupOpen === 1 ? "jogo" : "jogos"}).`
                  : `Fase classificatória concluída: gere a chave com os ${PLAYOFF_TEAMS[c.playoffFormat]} primeiros.`}
            </span>
            {!hasResults && (playoffs.length > 0 || groupOpen === 0) && (
              <GeneratePlayoffs championshipId={c.id} again={playoffs.length > 0} />
            )}
          </CardContent>
        </Card>
      )}

      {!playoffs.length ? (
        <Card className="p-6 text-center text-sm text-muted">
          {`Os ${PLAYOFF_TEAMS[c.playoffFormat]} primeiros da classificação disputam os playoffs em MD${c.playoffBestOf}. A chave aparece aqui ao fim da fase classificatória.`}
        </Card>
      ) : (
        <div>
          <div className="flex flex-col gap-6 md:flex-row">
            {Array.from({ length: totalRounds }, (_, i) => i + 1).map((round) => {
              const games = playoffs.filter((m) => m.round === round).sort((a, b) => a.leg - b.leg);
              return (
                <section key={round} className="flex flex-col md:flex-1">
                  <h2 className="mb-3 font-display text-sm font-semibold tracking-wide text-muted uppercase">
                    {roundTitle(c.playoffFormat, round)}{" "}
                    <span className="tracking-normal text-subtle normal-case">· MD{games[0]?.bestOf}</span>
                  </h2>
                  <div className="flex flex-1 flex-col justify-around gap-4">
                    {games.map((m) => {
                      const mine = maps.filter((x) => x.matchId === m.id).sort((a, b) => a.order - b.order);
                      return (
                        <Link
                          key={m.id}
                          href={`/campeonatos/${c.slug}/jogos/${m.id}`}
                          className={cn(
                            "block overflow-hidden rounded-lg border bg-surface transition-colors hover:border-brand/60",
                            round === totalRounds ? "border-brand/50" : "border-border",
                          )}
                        >
                          <div className="flex items-center justify-between border-b border-border px-3 py-1.5 text-[11px] text-muted">
                            <span className="font-semibold tracking-wide uppercase">
                              {playoffLabel(c.playoffFormat, m.round, m.leg)}
                            </span>
                            <span>
                              {m.scheduledAt && ["approval", "scheduled", "live", "finished"].includes(m.status)
                                ? formatWhen(m.scheduledAt)
                                : MATCH_STATUS_LABEL[m.status]}
                            </span>
                          </div>
                          {slot(m, "home")}
                          <div className="border-t border-border" />
                          {slot(m, "away")}
                          {mine.length > 0 && (
                            <div className="border-t border-border px-3 py-1.5 text-[11px] text-muted">
                              {mine.map((x) => `${x.mapId.replace(/^de_/, "")} ${x.home}-${x.away}`).join(" · ")}
                            </div>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
