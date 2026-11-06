import { Trophy } from "lucide-react";
import { notFound } from "next/navigation";
import { GeneratePlayoffs } from "@/components/championships/generate-playoffs";
import { GamesBoard } from "@/components/championships/games-board";
import { TeamLogo } from "@/components/championships/team-logo";
import { Card, CardContent } from "@/components/ui/card";
import { PLAYOFF_TEAMS } from "@/lib/championship";
import { playoffRounds } from "@/lib/championship-playoffs";
import { seriesState } from "@/lib/championship-standings";
import { getChampionship, getMapResults, getMatches, getRoster } from "@/services/championships";

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
  if (c.playoffFormat === "none")
    return (
      <Card className="p-6 text-center text-sm text-muted">
        Este campeonato não tem playoffs: vale a classificação.
      </Card>
    );

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
        <Card className="p-4">
          <GamesBoard
            slug={c.slug}
            teams={teams}
            matches={matches}
            scores={Object.fromEntries(
              playoffs.flatMap((m) => {
                const mine = maps.filter((x) => x.matchId === m.id);
                if (!mine.length) return [];
                const st = seriesState(mine, m.bestOf);
                return [[m.id, { home: st.home, away: st.away }]];
              }),
            )}
            format={c.playoffFormat}
            showGroup={false}
          />
        </Card>
      )}
    </div>
  );
}
