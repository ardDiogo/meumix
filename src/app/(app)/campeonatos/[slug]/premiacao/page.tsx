import { Coins, Medal } from "lucide-react";
import { notFound } from "next/navigation";
import { PaidForm } from "@/components/championships/paid-form";
import { TeamLogo } from "@/components/championships/team-logo";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { formatMoney, prizeDistribution } from "@/lib/championship";
import { cn } from "@/lib/utils";
import { getChampionship, getPaidPlayers } from "@/services/championships";
import { getSummary } from "@/services/championship-summary";

export const metadata = { title: "Premiação do campeonato" };

const MEDAL = ["text-yellow-400", "text-zinc-300", "text-amber-600"];

/** Premiação: arrecadação (pagantes × inscrição − custos) dividida pelos percentuais, com transparência. */
export default async function PrizePage({ params }: PageProps<"/campeonatos/[slug]/premiacao">) {
  const data = await getChampionship((await params).slug);
  if (!data) notFound();
  const { championship: c, canManage } = data;
  const [s, paid] = await Promise.all([getSummary(c), getPaidPlayers(c.id)]);
  const registered = s.players.length;
  const payers = paid ?? registered;
  const prize = prizeDistribution(c.entryFee, payers, c.prizeSplit, c.costs);
  const byId = new Map(s.teams.map((t) => [t.id, t]));
  const playersPerTeam = c.playersPerTeam;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      <Card>
        <CardHeader
          title="Distribuição"
          description={`Percentuais: ${c.prizeSplit.map((p) => `${p.toLocaleString("pt-BR")}%`).join(" / ")}`}
        />
        <ul className="divide-y divide-border">
          {prize.prizes.map((value, i) => {
            const teamId = s.placing[i] ?? null;
            const team = teamId ? byId.get(teamId) : null;
            return (
              <li key={i} className={cn("flex flex-wrap items-center gap-3 px-4 py-4", i === 0 && "bg-brand/[0.06]")}>
                <Medal className={cn("size-6 shrink-0", MEDAL[i] ?? "text-muted")} aria-hidden />
                <div className="w-20 shrink-0">
                  <div className="font-display text-lg font-bold">{i + 1}º lugar</div>
                  <div className="text-xs text-muted">{c.prizeSplit[i]?.toLocaleString("pt-BR")}%</div>
                </div>
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  {team ? (
                    <>
                      <TeamLogo team={team} size={32} />
                      <span className="truncate font-semibold">{team.name}</span>
                    </>
                  ) : (
                    <span className="text-sm text-subtle">A definir</span>
                  )}
                </div>
                <div className="text-right">
                  <div className="font-display text-xl font-bold tabular">{formatMoney(value)}</div>
                  <div className="text-xs text-muted">{formatMoney(value / playersPerTeam)} por jogador</div>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader title="Transparência" />
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted">Inscrição por jogador</span>
              <span className="font-semibold tabular">{formatMoney(c.entryFee)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Inscrições pagas</span>
              <span className="font-semibold tabular">
                {payers}
                {paid == null && <span className="font-normal text-subtle"> (inscritos)</span>}
              </span>
            </div>
            <div className="flex justify-between border-t border-border pt-2">
              <span className="text-muted">Arrecadação</span>
              <span className="font-semibold tabular">{formatMoney(prize.collected)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Custos operacionais</span>
              <span className="font-semibold text-loss tabular">− {formatMoney(c.costs)}</span>
            </div>
            <div className="flex justify-between border-t border-border pt-2">
              <span className="flex items-center gap-1.5 font-semibold">
                <Coins className="size-4 text-brand" aria-hidden /> Total distribuído
              </span>
              <span className="font-display text-lg font-bold text-brand tabular">{formatMoney(prize.pool)}</span>
            </div>
            <p className="pt-1 text-xs text-subtle">
              Centavos que sobram na divisão ficam com o 1º lugar. O pagamento é controlado pela organização, fora do
              site.
            </p>
          </CardContent>
        </Card>
        {canManage && (
          <Card>
            <CardContent>
              <PaidForm championshipId={c.id} paid={paid} registered={registered} />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
