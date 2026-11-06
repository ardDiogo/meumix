import { CalendarClock, Coins, Server, Shield, Swords, Trophy, Users } from "lucide-react";
import { notFound } from "next/navigation";
import { formatDays } from "@/components/championships/format";
import { Avatar } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { formatMoney, GROUP_FORMAT_LABEL, PLAYOFF_FORMAT_LABEL, prizeDistribution } from "@/lib/championship";
import { getChampionship } from "@/services/championships";

export async function generateMetadata({ params }: PageProps<"/campeonatos/[slug]">) {
  const data = await getChampionship((await params).slug);
  return { title: data?.championship.name ?? "Campeonato" };
}

function Item({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
      <div className="min-w-0">
        <div className="text-xs text-muted">{label}</div>
        <div className="text-sm font-medium">{value}</div>
      </div>
    </li>
  );
}

/** Visão geral: regras e números do campeonato (as próximas etapas trazem tabela, jogos e destaques). */
export default async function ChampionshipOverview({ params }: PageProps<"/campeonatos/[slug]">) {
  const data = await getChampionship((await params).slug);
  if (!data) notFound();
  const { championship: c, organizers, players } = data;
  const total = c.teamCount * c.playersPerTeam;
  const prize = prizeDistribution(c.entryFee, total, c.prizeSplit, c.costs);
  const creator = players.find((p) => p.id === c.createdBy);
  const staff = [
    ...(creator ? [{ userId: creator.id, nickname: creator.nickname, avatarUrl: creator.avatarUrl }] : []),
    ...organizers.filter((o) => o.userId !== c.createdBy),
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      <div className="min-w-0 space-y-4">
        {c.description && (
          <Card>
            <CardHeader title="Sobre" />
            <CardContent>
              <p className="text-sm leading-relaxed whitespace-pre-line text-muted">{c.description}</p>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader title="Formato" />
          <ul className="grid divide-y divide-border sm:grid-cols-2 sm:divide-y-0">
            <Item
              icon={Users}
              label="Equipes"
              value={`${c.teamCount} equipes de ${c.playersPerTeam} (${total} jogadores)`}
            />
            <Item
              icon={Shield}
              label="Formação das equipes"
              value={`Capitão + draft em ${c.potCount} potes (ordem em serpentina)`}
            />
            <Item
              icon={Swords}
              label="Fase classificatória"
              value={`${GROUP_FORMAT_LABEL[c.groupFormat]} · MD${c.groupBestOf} · vitória ${c.pointsWin} pts`}
            />
            <Item
              icon={Trophy}
              label="Playoffs"
              value={
                c.playoffFormat === "none"
                  ? PLAYOFF_FORMAT_LABEL.none
                  : `${PLAYOFF_FORMAT_LABEL[c.playoffFormat]} · MD${c.playoffBestOf}`
              }
            />
            <Item
              icon={CalendarClock}
              label="Quando os jogos podem acontecer"
              value={`${formatDays(c.matchDays)}, das ${c.windowStart} às ${c.windowEnd}`}
            />
            <Item icon={Server} label="Servidores" value={`Até ${c.servers} jogos ao mesmo tempo`} />
          </ul>
        </Card>
      </div>
      <div className="space-y-4">
        <Card>
          <CardHeader title="Premiação" description={`Inscrição de ${formatMoney(c.entryFee)} por jogador`} />
          <CardContent className="space-y-2">
            {prize.prizes.map((p, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className={i === 0 ? "font-semibold text-brand" : "text-muted"}>
                  <Coins className="mr-1.5 inline size-3.5" aria-hidden />
                  {i + 1}º lugar · {c.prizeSplit[i]?.toLocaleString("pt-BR")}%
                </span>
                <span className="font-semibold tabular">{formatMoney(p)}</span>
              </div>
            ))}
            <p className="pt-1 text-xs text-subtle">
              Com {total} inscrições: {formatMoney(prize.collected)}
              {c.costs ? ` − ${formatMoney(c.costs)} de custos` : ""}. Os valores mudam com o número de pagantes.
            </p>
          </CardContent>
        </Card>
        {staff.length > 0 && (
          <Card>
            <CardHeader title="Organização" />
            <ul className="divide-y divide-border">
              {staff.map((o) => (
                <li key={o.userId} className="flex items-center gap-2.5 px-4 py-2.5 text-sm">
                  <Avatar name={o.nickname} src={o.avatarUrl} size="sm" />
                  <span className="flex-1 truncate font-medium">{o.nickname}</span>
                  {o.userId === c.createdBy && <span className="text-xs text-subtle">criou</span>}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}
