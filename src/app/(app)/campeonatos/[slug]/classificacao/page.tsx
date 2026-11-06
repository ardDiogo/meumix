import { notFound } from "next/navigation";
import { TeamLogo } from "@/components/championships/team-logo";
import { Card, CardHeader } from "@/components/ui/card";
import { PLAYOFF_TEAMS } from "@/lib/championship";
import { standings } from "@/lib/championship-standings";
import { cn } from "@/lib/utils";
import { getChampionship, getMapResults, getMatches, getRoster } from "@/services/championships";

export const metadata = { title: "Classificação do campeonato" };

/** Classificação da fase classificatória, calculada na hora pelos placares. */
export default async function StandingsPage({ params }: PageProps<"/campeonatos/[slug]/classificacao">) {
  const data = await getChampionship((await params).slug);
  if (!data) notFound();
  const { championship: c } = data;
  const [{ teams }, { matches }, { maps }] = await Promise.all([
    getRoster(c.id),
    getMatches(c.id),
    getMapResults(c.id),
  ]);
  const group = matches.filter((m) => m.stage === "group" && m.homeTeam && m.awayTeam);
  const rows = standings(
    teams.map((t) => t.id),
    group.map((m) => ({
      home: m.homeTeam!,
      away: m.awayTeam!,
      bestOf: m.bestOf,
      maps: maps.filter((x) => x.matchId === m.id).map((x) => ({ home: x.home, away: x.away })),
    })),
    { pointsWin: c.pointsWin, pointsLoss: c.pointsLoss },
  );
  const byId = new Map(teams.map((t) => [t.id, t]));
  const cut = Math.min(PLAYOFF_TEAMS[c.playoffFormat], teams.length);
  const finished = group.filter((m) => m.status === "finished").length;
  const pct = (n: number) => `${n}%`;
  const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <CardHeader
          title="Classificação"
          description={`Fase classificatória · ${finished} de ${group.length} jogos finalizados · vitória ${c.pointsWin} pts, derrota ${c.pointsLoss}`}
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-xs font-semibold text-muted">
                <th className="w-12 px-4 py-3 text-left">#</th>
                <th className="px-2 py-3 text-left">Equipe</th>
                <th className="px-2 py-3 text-center" title="Partidas disputadas">
                  PJ
                </th>
                <th className="px-2 py-3 text-center" title="Vitórias">
                  V
                </th>
                <th className="px-2 py-3 text-center" title="Derrotas">
                  D
                </th>
                <th className="px-2 py-3 text-center">Pts</th>
                <th className="px-2 py-3 text-center" title="Rounds vencidos">
                  RV
                </th>
                <th className="px-2 py-3 text-center" title="Rounds perdidos">
                  RP
                </th>
                <th className="px-2 py-3 text-center" title="Saldo de rounds">
                  Saldo
                </th>
                <th className="px-4 py-3 text-center" title="Pontos conquistados ÷ pontos possíveis">
                  Aprov.
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const t = byId.get(r.team)!;
                const inPlayoffs = cut > 0 && i < cut;
                const out = cut > 0 && i >= cut;
                return (
                  <tr
                    key={r.team}
                    className={cn(
                      "border-b border-border last:border-0",
                      inPlayoffs && "bg-win/[0.04]",
                      out && "bg-loss/[0.04]",
                    )}
                  >
                    <td className="relative px-4 py-3 font-display font-bold">
                      <span
                        aria-hidden
                        className={cn(
                          "absolute inset-y-0 left-0 w-1",
                          inPlayoffs ? "bg-win" : out ? "bg-loss" : "bg-transparent",
                        )}
                      />
                      {i + 1}
                    </td>
                    <td className="px-2 py-3">
                      <span className="flex items-center gap-2 font-semibold">
                        <TeamLogo team={t} size={28} />
                        <span className="truncate">{t.name}</span>
                      </span>
                    </td>
                    <td className="px-2 py-3 text-center tabular">{r.played}</td>
                    <td className="px-2 py-3 text-center text-win tabular">{r.wins}</td>
                    <td className="px-2 py-3 text-center text-loss tabular">{r.losses}</td>
                    <td className="px-2 py-3 text-center font-display text-base font-bold tabular">{r.points}</td>
                    <td className="px-2 py-3 text-center tabular">{r.roundsWon}</td>
                    <td className="px-2 py-3 text-center tabular">{r.roundsLost}</td>
                    <td
                      className={cn(
                        "px-2 py-3 text-center font-semibold tabular",
                        r.roundDiff > 0 ? "text-win" : r.roundDiff < 0 ? "text-loss" : "text-muted",
                      )}
                    >
                      {signed(r.roundDiff)}
                    </td>
                    <td className="px-4 py-3 text-center tabular">{pct(r.efficiency)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-border px-4 py-3 text-xs text-muted">
          {cut > 0 && (
            <>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-win" /> Classificados para os playoffs ({cut})
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-loss" /> Eliminados
              </span>
            </>
          )}
          <span>
            Desempate: pontos → confronto direto (ou mini-classificação entre os empatados) → saldo de rounds → rounds
            vencidos.
          </span>
        </div>
      </Card>
    </div>
  );
}
