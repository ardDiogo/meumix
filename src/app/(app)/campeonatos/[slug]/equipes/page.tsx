import { CheckCircle2, Crown, Shield, Users } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AddPlayersDialog,
  DeleteTeamButton,
  RemovePlayerButton,
  TeamDialog,
  type Person,
} from "@/components/championships/roster-manager";
import { JoinByCode, LeaveTeam, PlayerTeamSelect, TeamCode } from "@/components/championships/code-teams";
import { TeamLogo } from "@/components/championships/team-logo";
import { PlayerLink } from "@/components/players/player-link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { codeRosterIssues, rosterIssues } from "@/lib/championship";
import { getChampionship, getDraft, getRoster, getTeamCodes } from "@/services/championships";
import { getDataSource } from "@/services/index";
import type { Player } from "@/types/domain";

export const metadata = { title: "Equipes do campeonato" };

const STARTED = new Set(["running", "playoffs", "finished"]);

/** Equipes: times com capitão e elenco, e os inscritos. Quem organiza gerencia tudo aqui. */
export default async function TeamsPage({ params, searchParams }: PageProps<"/campeonatos/[slug]/equipes">) {
  const data = await getChampionship((await params).slug);
  const { codigo } = await searchParams;
  if (!data) notFound();
  const { championship: c, canManage, players: all, session } = data;
  // Por código: cada time tem um código e quem entra já está no time (sem potes nem draft).
  const byCode = c.teamMode === "code";
  const [{ teams, players }, draft] = await Promise.all([getRoster(c.id), getDraft(c.id)]);
  const byId = new Map(all.map((p) => [p.id, p]));
  const person = (id: string): Person => {
    const p = byId.get(id);
    return { id, nickname: p?.nickname ?? "Jogador", avatarUrl: p?.avatarUrl ?? null };
  };
  const asPlayer = (id: string): Player => byId.get(id) ?? { ...person(id), steamId: null, createdAt: "" };
  // Com o draft em andamento (ou feito), inscritos e times ficam fechados (reiniciar o draft reabre).
  const editable = canManage && !STARTED.has(c.status) && !draft.status;
  const needed = c.teamCount * c.playersPerTeam;
  const issues = byCode ? codeRosterIssues(c, teams, players) : rosterIssues(c, teams, players);
  const myEntry = session ? players.find((p) => p.userId === session.id) : undefined;
  const myTeam = myEntry?.teamId ? teams.find((t) => t.id === myEntry.teamId) : undefined;
  // Códigos: a organização vê todos; o capitão, o do próprio time.
  const codes = byCode && (canManage || teams.some((t) => t.captainId === session?.id)) ? await getTeamCodes(c.id) : {};
  const closed = STARTED.has(c.status) || c.status === "cancelled";
  const registered = new Set(players.map((p) => p.userId));
  const candidates = all.filter((p) => !registered.has(p.id)).map((p) => person(p.id));
  const captains = new Set(teams.map((t) => t.captainId).filter(Boolean));
  // Versão do escudo na URL: muda a cada carregamento (o escudo fica 1 minuto em cache).
  const version = String(getDataSource().now().getTime());
  const sortedPlayers = [...players].sort((a, b) =>
    person(a.userId).nickname.localeCompare(person(b.userId).nickname, "pt-BR"),
  );

  return (
    <div className="space-y-4">
      {canManage && draft.status && (
        <Card>
          <CardContent className="text-sm text-muted">
            {draft.status === "done"
              ? "Draft concluído: os elencos estão formados."
              : "Draft em andamento: inscritos e times ficam fechados até o fim (ou até reiniciar o draft)."}
          </CardContent>
        </Card>
      )}
      {canManage && !draft.status && (
        <Card className={issues.length ? "border-brand/40" : "border-win/40"}>
          <CardContent className="flex flex-wrap items-start gap-3 text-sm">
            {issues.length ? (
              <>
                <Shield className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">
                    {byCode ? "Para fechar os times" : "Para montar os potes do draft"}
                  </div>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted">
                    {issues.map((i) => (
                      <li key={i}>{i}</li>
                    ))}
                  </ul>
                </div>
              </>
            ) : (
              <>
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-win" aria-hidden />
                <div className="flex-1">
                  <div className="font-semibold">{byCode ? "Times completos" : "Inscritos e capitães completos"}</div>
                  <p className="text-muted">
                    {byCode
                      ? "Próximo passo: gerar os confrontos (aba Calendário → Agendamento)."
                      : "Próximo passo: montar os potes do draft."}
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {byCode && !closed && (
        <Card className="border-brand/40">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 text-sm">
            {!session ? (
              <span className="text-muted">
                Tem o código do seu time?{" "}
                <Link href="/entrar" className="text-brand hover:underline">
                  Entre na sua conta
                </Link>{" "}
                para entrar no time.
              </span>
            ) : myTeam ? (
              <>
                <span className="flex items-center gap-2">
                  <TeamLogo team={{ ...myTeam, logoVersion: version }} size={28} />
                  Você está no <b className="text-fg">{myTeam.name}</b>
                  {myTeam.captainId === session.id && (
                    <span className="flex items-center gap-1 text-xs font-semibold text-brand">
                      <Crown className="size-3.5" aria-hidden /> capitão
                    </span>
                  )}
                </span>
                <LeaveTeam championshipId={c.id} teamName={myTeam.name} />
              </>
            ) : (
              <>
                <span className="text-muted">
                  <b className="text-fg">Entrar num time:</b> digite o código que o capitão ou a organização passou.
                </span>
                <JoinByCode championshipId={c.id} initial={typeof codigo === "string" ? codigo : ""} />
              </>
            )}
          </CardContent>
        </Card>
      )}

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-sm font-semibold tracking-wide text-muted uppercase">
            Times{" "}
            <span className="tracking-normal text-subtle normal-case">
              · {teams.length} de {c.teamCount}
            </span>
          </h2>
          {editable && teams.length < c.teamCount && (
            <TeamDialog
              championshipId={c.id}
              captainOptions={byCode ? [] : sortedPlayers.filter((p) => !p.teamId).map((p) => person(p.userId))}
            />
          )}
        </div>
        {teams.length === 0 ? (
          <Card>
            <EmptyState
              icon={Users}
              title="Nenhum time ainda"
              description={
                editable
                  ? byCode
                    ? "Crie os times: cada um ganha um código para os jogadores entrarem."
                    : "Crie os times e escolha o capitão de cada um."
                  : "Os times aparecem aqui."
              }
            />
          </Card>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {teams.map((t) => {
              const roster = players.filter((p) => p.teamId === t.id && p.userId !== t.captainId);
              const slots = c.playersPerTeam - 1;
              return (
                <li key={t.id}>
                  <Card className="h-full overflow-hidden">
                    <div className="h-1" style={{ background: t.color }} />
                    <div className="flex items-center gap-3 px-4 py-3">
                      <TeamLogo team={{ ...t, logoVersion: version }} size={44} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-display text-base font-bold">{t.name}</div>
                        {t.tag && <div className="text-xs font-semibold tracking-wider text-muted">{t.tag}</div>}
                      </div>
                      {editable && (
                        <div className="flex shrink-0">
                          <TeamDialog
                            championshipId={c.id}
                            team={t}
                            logoVersion={version}
                            captainOptions={sortedPlayers
                              .filter((p) => (byCode ? p.teamId === t.id : !p.teamId || p.userId === t.captainId))
                              .map((p) => person(p.userId))}
                          />
                          <DeleteTeamButton championshipId={c.id} team={t} />
                        </div>
                      )}
                    </div>
                    <ul className="divide-y divide-border border-t border-border">
                      <li className="flex items-center gap-2 px-4 py-2 text-sm">
                        {t.captainId ? (
                          <PlayerLink player={asPlayer(t.captainId)} className="flex-1" />
                        ) : (
                          <span className="flex-1 text-muted">Sem capitão</span>
                        )}
                        <span className="flex items-center gap-1 text-xs font-semibold text-brand">
                          <Crown className="size-3.5" aria-hidden /> Capitão
                        </span>
                      </li>
                      {roster.map((p) => (
                        <li key={p.userId} className="flex items-center gap-2 px-4 py-2 text-sm">
                          <PlayerLink player={asPlayer(p.userId)} className="flex-1" />
                          {p.pot && <span className="text-xs text-subtle">Pote {p.pot}</span>}
                        </li>
                      ))}
                      {Array.from({ length: Math.max(0, slots - roster.length) }, (_, i) => (
                        <li key={`vaga-${i}`} className="px-4 py-2 text-sm text-subtle">
                          {byCode ? "Vaga" : "Vaga do draft"}
                        </li>
                      ))}
                    </ul>
                    {codes[t.id] && (canManage || t.captainId === session?.id) && (
                      <TeamCode
                        championshipId={c.id}
                        teamId={t.id}
                        code={codes[t.id]!}
                        slug={c.slug}
                        canRegenerate={canManage}
                      />
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Card>
        <CardHeader
          title={`Inscritos · ${players.length} de ${needed}`}
          description={
            byCode
              ? "Quem entrou pelo código já está no time. A organização também pode inscrever e escolher o time."
              : "Jogadores cadastrados no MeuMix. Os capitães fazem parte dos inscritos."
          }
          action={
            editable ? (
              <AddPlayersDialog championshipId={c.id} candidates={candidates} vagas={needed - players.length} />
            ) : undefined
          }
        />
        {players.length === 0 ? (
          <EmptyState icon={Users} title="Ninguém inscrito ainda" />
        ) : (
          <ul className="grid divide-y divide-border sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-3">
            {sortedPlayers.map((p) => {
              const team = teams.find((t) => t.id === p.teamId);
              return (
                <li key={p.userId} className="flex items-center gap-2 border-border px-4 py-2 text-sm sm:border-b">
                  <PlayerLink player={asPlayer(p.userId)} className="min-w-0 flex-1" />
                  {byCode && canManage && !closed ? (
                    <PlayerTeamSelect
                      championshipId={c.id}
                      userId={p.userId}
                      name={person(p.userId).nickname}
                      teamId={p.teamId}
                      teams={teams.map((t) => ({ id: t.id, name: t.name }))}
                    />
                  ) : captains.has(p.userId) ? (
                    <span
                      className="flex items-center gap-1 text-xs font-semibold text-brand"
                      title={`Capitão do ${team?.name}`}
                    >
                      <Crown className="size-3.5" aria-hidden /> {team?.tag || team?.name}
                    </span>
                  ) : team ? (
                    <span className="text-xs text-muted">{team.tag || team.name}</span>
                  ) : null}
                  {editable && !captains.has(p.userId) && (
                    <RemovePlayerButton championshipId={c.id} userId={p.userId} name={person(p.userId).nickname} />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
