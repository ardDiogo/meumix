import { Coins, HelpCircle, ListOrdered, LogIn, Shuffle, Swords, Trophy, Users } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AutoRegister } from "@/components/championships/auto-register";
import { formatDays } from "@/components/championships/format";
import { ShareChampionshipButton } from "@/components/championships/share-championship";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  formatMoney,
  GROUP_FORMAT_LABEL,
  PLAYOFF_FORMAT_LABEL,
  PLAYOFF_TEAMS,
  prizeDistribution,
} from "@/lib/championship";
import { championshipShareText } from "@/lib/championship-share";
import { getChampionship, getRoster } from "@/services/championships";

export async function generateMetadata({ params }: PageProps<"/campeonatos/[slug]/inscrever">) {
  const data = await getChampionship((await params).slug);
  if (!data) return { title: "Campeonato" };
  const c = data.championship;
  const banner = c.hasBanner
    ? [`/api/campeonatos/${c.id}/banner?v=${encodeURIComponent(c.updatedAt)}`]
    : [{ url: "/brand/og-share.jpg", width: 1200, height: 630, alt: "MeuMix" }];
  const description = `${c.teamCount} times ${c.playersPerTeam}x${c.playersPerTeam}${
    c.entryFee > 0 ? ` · inscrição ${formatMoney(c.entryFee)}` : ""
  }. Toque para se inscrever.`;
  return {
    title: `Inscrição: ${c.name}`,
    description,
    openGraph: { title: `🏆 ${c.name}`, description, images: banner },
  };
}

function Rule({ icon: Icon, title, children }: { icon: typeof Users; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3 px-4 py-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
      <div className="min-w-0 text-sm">
        <div className="font-semibold">{title}</div>
        <div className="text-muted">{children}</div>
      </div>
    </li>
  );
}

/** Link de inscrição em 1 toque (o que vai no WhatsApp): inscreve, explica o formato e mostra os inscritos. */
export default async function ChampionshipJoinPage({ params }: PageProps<"/campeonatos/[slug]/inscrever">) {
  const data = await getChampionship((await params).slug);
  if (!data) notFound();
  const { championship: c, session, players: all } = data;
  const { players } = await getRoster(c.id);
  const byId = new Map(all.map((p) => [p.id, p]));
  const vagas = c.teamCount * c.playersPerTeam;
  const open =
    c.teamMode === "draft" ? c.status === "registration" : c.status === "registration" || c.status === "teams";
  const me = session ? players.some((p) => p.userId === session.id) : false;
  const full = players.length >= vagas;
  const prize = c.entryFee > 0 ? prizeDistribution(c.entryFee, vagas, c.prizeSplit, c.costs) : null;
  const playoffTeams = PLAYOFF_TEAMS[c.playoffFormat];
  const path = `/campeonatos/${c.slug}/inscrever`;
  const message = championshipShareText(c, {
    registered: players.length,
    vagas,
    firstPrize: prize?.prizes[0] ?? null,
    url: "{link}",
  });

  return (
    <div className="space-y-4">
      <Card className="border-brand/40">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="text-xs font-bold tracking-wider text-brand uppercase">
              {open ? "Inscrições abertas" : c.status === "setup" ? "Inscrições em breve" : "Inscrições encerradas"}
            </div>
            <div className="text-sm text-muted">
              {players.length}/{vagas} {c.teamMode === "draft" ? "inscritos" : "jogadores nos times"}
              {c.entryFee > 0 ? ` · inscrição ${formatMoney(c.entryFee)} (paga à organização)` : ""}
            </div>
            {!session ? (
              open && (
                <Button variant="primary" className="mt-2" asChild>
                  <Link href={`/entrar?next=${encodeURIComponent(path)}`}>
                    <LogIn /> Entrar e se inscrever
                  </Link>
                </Button>
              )
            ) : me ? (
              <p className="pt-1 text-sm font-semibold text-win">Você está inscrito. Bora! 🔥</p>
            ) : open && c.teamMode === "draft" && !full ? (
              <div className="pt-1">
                <AutoRegister championshipId={c.id} slug={c.slug} />
              </div>
            ) : open && c.teamMode === "code" ? (
              <Button variant="primary" className="mt-2" asChild>
                <Link href={`/campeonatos/${c.slug}/equipes`}>Inscrever-se com o código do time</Link>
              </Button>
            ) : full ? (
              <p className="pt-1 text-sm font-semibold text-muted">Vagas preenchidas.</p>
            ) : null}
          </div>
          <ShareChampionshipButton
            path={path}
            message={message}
            bannerUrl={c.hasBanner ? `/api/campeonatos/${c.id}/banner?v=${encodeURIComponent(c.updatedAt)}` : null}
            fileName={`${c.slug}.jpg`}
          />
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <Card>
          <CardHeader
            title="Como funciona"
            action={
              <Link href={`/campeonatos/${c.slug}/como-funciona`} className="text-xs text-muted hover:text-brand">
                Regulamento completo →
              </Link>
            }
          />
          <ul className="divide-y divide-border">
            <Rule icon={Users} title={`${c.teamCount} times de ${c.playersPerTeam} jogadores (${vagas} vagas)`}>
              {c.teamMode === "draft"
                ? "Você se inscreve sozinho. Depois os capitães montam os times no draft, escolhendo um jogador por vez."
                : "Cada time entra com o seu código: peça o código ao capitão do seu time."}
            </Rule>
            {c.teamMode === "draft" && (
              <Rule icon={Shuffle} title="Capitães, potes e draft">
                Cada time tem um capitão. Os outros inscritos vão para {c.playersPerTeam - 1} potes, do nível mais alto
                ao mais baixo, com um jogador por time em cada pote. Os capitães jogam a adedonha para definir a ordem e
                escolhem pote por pote, em serpentina (quem escolheu por último escolhe primeiro no pote seguinte).
                Times equilibrados, sem panela.
              </Rule>
            )}
            <Rule icon={ListOrdered} title={`Classificatória: ${GROUP_FORMAT_LABEL[c.groupFormat]}`}>
              Partidas MD{c.groupBestOf}. Vitória vale {c.pointsWin} ponto{c.pointsWin === 1 ? "" : "s"}
              {c.pointsLoss ? `, derrota ${c.pointsLoss}` : ""}. Os jogos são em {formatDays(c.matchDays)}, das{" "}
              {c.windowStart} às {c.windowEnd}.
            </Rule>
            <Rule icon={Swords} title={`Playoffs: ${PLAYOFF_FORMAT_LABEL[c.playoffFormat]}`}>
              {playoffTeams
                ? `Os ${playoffTeams} melhores da classificatória avançam. Partidas MD${c.playoffBestOf}.`
                : "Campeão é quem termina em 1º na classificação."}
            </Rule>
            {prize && (
              <Rule icon={Coins} title={`Inscrição ${formatMoney(c.entryFee)} · premiação`}>
                {prize.prizes
                  .map((v, i) => (v > 0 ? `${i + 1}º lugar ${formatMoney(v)}` : null))
                  .filter(Boolean)
                  .join(" · ")}{" "}
                (com as {vagas} vagas pagas). O pagamento é combinado com a organização.
              </Rule>
            )}
            <Rule icon={Trophy} title="Estatísticas e MVP">
              Cada mapa entra com os dados da GC: tabela, artilharia, MVP e premiação ficam no site do campeonato.
            </Rule>
          </ul>
        </Card>

        <Card className="self-start">
          <CardHeader
            title={`Inscritos (${players.length}/${vagas})`}
            description={players.length ? "Por ordem de inscrição." : "Seja o primeiro!"}
          />
          {players.length ? (
            <CardContent>
              <ul className="grid grid-cols-2 gap-2">
                {players.map((p) => {
                  const pl = byId.get(p.userId);
                  return (
                    <li key={p.userId} className="flex min-w-0 items-center gap-2 text-sm">
                      <Avatar name={pl?.nickname ?? "Jogador"} src={pl?.avatarUrl ?? null} size="xs" />
                      <span className="truncate">{pl?.nickname ?? "Jogador"}</span>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          ) : (
            <CardContent>
              <p className="flex items-center gap-2 text-sm text-muted">
                <HelpCircle className="size-4" /> Ainda ninguém. Compartilhe com a galera.
              </p>
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}
