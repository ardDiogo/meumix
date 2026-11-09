import { CalendarClock, Crown, Server, Shield, Swords, Trophy, Users } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDays } from "@/components/championships/format";
import { TeamLogo } from "@/components/championships/team-logo";
import { RegisterButton } from "@/components/championships/register-button";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/stats/stat-card";
import { Avatar } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  formatMoney,
  GROUP_FORMAT_LABEL,
  PLAYOFF_FORMAT_LABEL,
  PLAYOFF_TEAMS,
  prizeDistribution,
} from "@/lib/championship";
import { playoffLabel } from "@/lib/championship-playoffs";
import { formatWhen } from "@/lib/championship-schedule";
import { BOARDS, leaders, mvpOf } from "@/lib/championship-stats";
import { cn } from "@/lib/utils";
import { getChampionship, getPaidPlayers, type MatchRow } from "@/services/championships";
import { getSummary } from "@/services/championship-summary";

export async function generateMetadata({ params }: PageProps<"/campeonatos/[slug]">) {
  const data = await getChampionship((await params).slug);
  return { title: data?.championship.name ?? "Campeonato" };
}

const dec = (n: number | null) =>
  n == null ? "-" : n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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

/** Visão geral: o portal do campeonato (campeão, números, próximos jogos, resultados, tabela e destaques). */
export default async function ChampionshipOverview({ params }: PageProps<"/campeonatos/[slug]">) {
  const data = await getChampionship((await params).slug);
  if (!data) notFound();
  const { championship: c, organizers, players: all, session } = data;
  const [s, paid] = await Promise.all([getSummary(c), getPaidPlayers(c.id)]);
  const byTeam = new Map(s.teams.map((t) => [t.id, t]));
  const byUser = new Map(all.map((p) => [p.id, p]));
  const prize = prizeDistribution(
    c.entryFee,
    paid ?? (s.players.length || c.teamCount * c.playersPerTeam),
    c.prizeSplit,
    c.costs,
  );
  const champion = s.placing[0] ? byTeam.get(s.placing[0]) : null;
  const pending = s.progress.total - s.progress.finished;
  const label = (m: MatchRow) =>
    m.stage === "playoff" ? playoffLabel(c.playoffFormat, m.round, m.leg) : `Rodada ${m.round}`;
  const upcoming = s.matches
    .filter((m) => ["scheduled", "approval", "live"].includes(m.status) && m.scheduledAt)
    .sort((a, b) => a.scheduledAt!.localeCompare(b.scheduledAt!))
    .slice(0, 5);
  const recent = s.matches
    .filter((m) => m.status === "finished")
    .sort(
      (a, b) =>
        (b.scheduledAt ?? "").localeCompare(a.scheduledAt ?? "") ||
        (b.stage === "playoff" ? 1 : 0) - (a.stage === "playoff" ? 1 : 0) ||
        b.round - a.round,
    )
    .slice(0, 5);
  const mvp = mvpOf(s.lines);
  const top = leaders(s.lines, BOARDS[0]!, 5);
  const cut = PLAYOFF_TEAMS[c.playoffFormat];
  const creator = all.find((p) => p.id === c.createdBy);
  const staff = [
    ...(creator ? [{ userId: creator.id, nickname: creator.nickname, avatarUrl: creator.avatarUrl }] : []),
    ...organizers.filter((o) => o.userId !== c.createdBy),
  ];

  const matchRow = (m: MatchRow, showScore: boolean) => {
    const home = m.homeTeam ? byTeam.get(m.homeTeam) : null;
    const away = m.awayTeam ? byTeam.get(m.awayTeam) : null;
    const sc = showScore ? s.score(m.id, m.bestOf) : null;
    return (
      <li key={m.id}>
        <Link
          href={`/campeonatos/${c.slug}/jogos/${m.id}`}
          className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-surface-2/50"
        >
          <span className="w-24 shrink-0 text-xs text-muted">{label(m)}</span>
          <span className="flex min-w-0 flex-1 items-center justify-end gap-1.5 font-semibold">
            <span className={cn("truncate", m.winnerTeam && m.winnerTeam !== m.homeTeam && "text-muted")}>
              {home?.name ?? "A definir"}
            </span>
            {home && <TeamLogo team={home} size={20} />}
          </span>
          <span className="w-14 shrink-0 text-center font-display font-bold tabular">
            {sc ? `${sc.home}:${sc.away}` : <span className="text-xs font-normal text-subtle">×</span>}
          </span>
          <span className="flex min-w-0 flex-1 items-center gap-1.5 font-semibold">
            {away && <TeamLogo team={away} size={20} />}
            <span className={cn("truncate", m.winnerTeam && m.winnerTeam !== m.awayTeam && "text-muted")}>
              {away?.name ?? "A definir"}
            </span>
          </span>
          {!showScore && m.scheduledAt && (
            <span className="hidden w-28 shrink-0 text-right text-xs text-muted sm:block">
              {formatWhen(m.scheduledAt)}
            </span>
          )}
        </Link>
      </li>
    );
  };

  const vagas = c.teamCount * c.playersPerTeam;
  const registration = c.status === "registration" || (c.teamMode === "code" && c.status === "teams");
  const me = session ? s.players.find((p) => p.userId === session.id) : undefined;

  return (
    <div className="space-y-4">
      {registration && (
        <Card className="border-brand/40">
          <div className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold tracking-wider text-brand uppercase">Inscrições abertas</div>
              <div className="text-sm text-muted">
                {s.players.length}/{vagas} {c.teamMode === "draft" ? "inscritos" : "jogadores nos times"}
                {c.entryFee > 0 ? ` · inscrição ${formatMoney(c.entryFee)} (paga à organização)` : ""}
              </div>
            </div>
            {!session ? (
              <Button variant="primary" asChild>
                <Link href={`/entrar?next=${encodeURIComponent(`/campeonatos/${c.slug}`)}`}>
                  Entrar para se inscrever
                </Link>
              </Button>
            ) : c.teamMode === "draft" ? (
              <RegisterButton championshipId={c.id} registered={!!me} full={s.players.length >= vagas} />
            ) : me ? (
              <span className="text-sm font-semibold text-win">Você já está num time</span>
            ) : (
              <Button variant="primary" asChild>
                <Link href={`/campeonatos/${c.slug}/equipes`}>Inscrever-se com o código do time</Link>
              </Button>
            )}
          </div>
        </Card>
      )}
      {champion && (
        <Card className="overflow-hidden border-brand/60 shadow-[0_0_40px_-12px] shadow-brand/60">
          <div className="flex flex-wrap items-center gap-4 bg-gradient-to-r from-brand/25 via-brand/5 to-transparent px-5 py-4">
            <Trophy className="size-9 shrink-0 text-brand" aria-hidden />
            <TeamLogo team={champion} size={48} />
            <div className="min-w-0">
              <div className="text-xs font-bold tracking-[0.25em] text-brand uppercase">Campeão</div>
              <div className="truncate font-display text-2xl font-bold">{champion.name}</div>
            </div>
          </div>
        </Card>
      )}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Equipes" value={String(s.teams.length || c.teamCount)} />
        <StatCard label="Jogadores" value={String(s.players.length)} />
        <StatCard label="Partidas realizadas" value={String(s.progress.finished)} accent />
        <StatCard label="Partidas pendentes" value={String(pending)} />
      </section>
      {s.progress.total > 0 && (
        <div>
          <div className="mb-1 flex justify-between text-xs text-muted">
            <span>Progresso da competição</span>
            <span className="tabular">
              {s.progress.finished} de {s.progress.total} jogos
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-3">
            <div
              className="h-full rounded-full bg-brand transition-all"
              style={{ width: `${(s.progress.finished / s.progress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader
              title="Próximos confrontos"
              action={
                <Link href={`/campeonatos/${c.slug}/calendario`} className="text-xs text-muted hover:text-brand">
                  Calendário →
                </Link>
              }
            />
            {upcoming.length ? (
              <ul className="divide-y divide-border">{upcoming.map((m) => matchRow(m, false))}</ul>
            ) : (
              <CardContent className="text-sm text-muted">Nenhum jogo agendado no momento.</CardContent>
            )}
          </Card>
          <Card>
            <CardHeader title="Últimos resultados" />
            {recent.length ? (
              <ul className="divide-y divide-border">{recent.map((m) => matchRow(m, true))}</ul>
            ) : (
              <CardContent className="text-sm text-muted">Os resultados aparecem aqui.</CardContent>
            )}
          </Card>
          {s.teams.length > 0 && (
            <Card className="overflow-hidden">
              <CardHeader
                title="Classificação"
                action={
                  <Link href={`/campeonatos/${c.slug}/classificacao`} className="text-xs text-muted hover:text-brand">
                    Completa →
                  </Link>
                }
              />
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs font-semibold text-muted">
                    <th className="w-10 px-4 py-2 text-left">#</th>
                    <th className="px-2 py-2 text-left">Equipe</th>
                    <th className="px-2 py-2 text-center">PJ</th>
                    <th className="px-2 py-2 text-center">Pts</th>
                    <th className="px-4 py-2 text-center">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {s.table.map((r, i) => {
                    const t = byTeam.get(r.team)!;
                    return (
                      <tr key={r.team} className="border-b border-border last:border-0">
                        <td className="relative px-4 py-2 font-display font-bold">
                          <span
                            aria-hidden
                            className={cn("absolute inset-y-0 left-0 w-1", cut ? (i < cut ? "bg-win" : "bg-loss") : "")}
                          />
                          {i + 1}
                        </td>
                        <td className="px-2 py-2">
                          <span className="flex items-center gap-2 font-semibold">
                            <TeamLogo team={t} size={22} />
                            <span className="truncate">{t.name}</span>
                          </span>
                        </td>
                        <td className="px-2 py-2 text-center tabular">{r.played}</td>
                        <td className="px-2 py-2 text-center font-display font-bold tabular">{r.points}</td>
                        <td
                          className={cn(
                            "px-4 py-2 text-center tabular",
                            r.roundDiff > 0 ? "text-win" : r.roundDiff < 0 ? "text-loss" : "text-muted",
                          )}
                        >
                          {r.roundDiff > 0 ? `+${r.roundDiff}` : r.roundDiff}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          )}
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
              <Item icon={Users} label="Equipes" value={`${c.teamCount} equipes de ${c.playersPerTeam}`} />
              <Item
                icon={Shield}
                label="Formação das equipes"
                value={
                  c.teamMode === "code"
                    ? "Times definidos: entrada por código"
                    : `Capitão + draft em ${c.potCount} ${c.potCount === 1 ? "pote" : "potes"} (serpentina)`
                }
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
          {mvp?.userId && (
            <Card className="border-purple-500/40">
              <CardContent className="flex items-center gap-3">
                <Avatar
                  name={byUser.get(mvp.userId)?.nickname ?? "?"}
                  src={byUser.get(mvp.userId)?.avatarUrl ?? null}
                  size="md"
                  className="rounded-lg border-2 border-purple-500"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-1 text-[11px] font-bold tracking-widest text-purple-400 uppercase">
                    <Crown className="size-3.5" aria-hidden /> MVP atual
                  </div>
                  <Link
                    href={`/campeonatos/${c.slug}/jogadores/${mvp.userId}`}
                    className="block truncate font-display text-lg font-bold hover:text-brand"
                  >
                    {byUser.get(mvp.userId)?.nickname}
                  </Link>
                  <div className="text-xs text-muted">rating {dec(mvp.rating)}</div>
                </div>
              </CardContent>
            </Card>
          )}
          {top.length > 0 && (
            <Card>
              <CardHeader
                title="Top 5 jogadores"
                description="Rating médio"
                action={
                  <Link href={`/campeonatos/${c.slug}/estatisticas`} className="text-xs text-muted hover:text-brand">
                    Todos →
                  </Link>
                }
              />
              <ol className="divide-y divide-border">
                {top.map(({ line, value }, i) => (
                  <li key={line.key} className="flex items-center gap-2.5 px-4 py-2 text-sm">
                    <span
                      className={i === 0 ? "w-4 font-display font-bold text-brand" : "w-4 font-display text-subtle"}
                    >
                      {i + 1}
                    </span>
                    <Avatar
                      name={byUser.get(line.userId!)?.nickname ?? "?"}
                      src={byUser.get(line.userId!)?.avatarUrl ?? null}
                      size="xs"
                    />
                    <Link
                      href={`/campeonatos/${c.slug}/jogadores/${line.userId}`}
                      className="min-w-0 flex-1 truncate font-medium hover:text-brand"
                    >
                      {byUser.get(line.userId!)?.nickname}
                    </Link>
                    <span className="font-semibold tabular">{dec(value)}</span>
                  </li>
                ))}
              </ol>
            </Card>
          )}
          <Card>
            <CardHeader
              title="Premiação"
              description={`Inscrição de ${formatMoney(c.entryFee)} por jogador`}
              action={
                <Link href={`/campeonatos/${c.slug}/premiacao`} className="text-xs text-muted hover:text-brand">
                  Detalhes →
                </Link>
              }
            />
            <CardContent className="space-y-2">
              {prize.prizes.map((p, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className={i === 0 ? "font-semibold text-brand" : "text-muted"}>
                    {i + 1}º lugar · {c.prizeSplit[i]?.toLocaleString("pt-BR")}%
                  </span>
                  <span className="font-semibold tabular">{formatMoney(p)}</span>
                </div>
              ))}
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
    </div>
  );
}
