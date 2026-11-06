import { CheckCircle2, Crown, Shield, Users } from "lucide-react";
import { notFound } from "next/navigation";
import {
  AddPlayersDialog,
  DeleteTeamButton,
  RemovePlayerButton,
  TeamDialog,
  type Person,
} from "@/components/championships/roster-manager";
import { TeamLogo } from "@/components/championships/team-logo";
import { PlayerLink } from "@/components/players/player-link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { rosterIssues } from "@/lib/championship";
import { getChampionship, getRoster } from "@/services/championships";
import { getDataSource } from "@/services/index";
import type { Player } from "@/types/domain";

export const metadata = { title: "Equipes do campeonato" };

const STARTED = new Set(["running", "playoffs", "finished"]);

/** Equipes: times com capitão e elenco, e os inscritos. Quem organiza gerencia tudo aqui. */
export default async function TeamsPage({ params }: PageProps<"/campeonatos/[slug]/equipes">) {
  const data = await getChampionship((await params).slug);
  if (!data) notFound();
  const { championship: c, canManage, players: all } = data;
  const { teams, players } = await getRoster(c.id);
  const byId = new Map(all.map((p) => [p.id, p]));
  const person = (id: string): Person => {
    const p = byId.get(id);
    return { id, nickname: p?.nickname ?? "Jogador", avatarUrl: p?.avatarUrl ?? null };
  };
  const asPlayer = (id: string): Player => byId.get(id) ?? { ...person(id), steamId: null, createdAt: "" };
  const editable = canManage && !STARTED.has(c.status);
  const needed = c.teamCount * c.playersPerTeam;
  const issues = rosterIssues(c, teams, players);
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
      {canManage && (
        <Card className={issues.length ? "border-brand/40" : "border-win/40"}>
          <CardContent className="flex flex-wrap items-start gap-3 text-sm">
            {issues.length ? (
              <>
                <Shield className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">Para montar os potes do draft</div>
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
                  <div className="font-semibold">Inscritos e capitães completos</div>
                  <p className="text-muted">Próximo passo: montar os potes do draft.</p>
                </div>
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
              captainOptions={sortedPlayers.filter((p) => !p.teamId).map((p) => person(p.userId))}
            />
          )}
        </div>
        {teams.length === 0 ? (
          <Card>
            <EmptyState
              icon={Users}
              title="Nenhum time ainda"
              description={editable ? "Crie os times e escolha o capitão de cada um." : "Os times aparecem aqui."}
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
                              .filter((p) => !p.teamId || p.userId === t.captainId)
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
                          Vaga do draft
                        </li>
                      ))}
                    </ul>
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
          description="Jogadores cadastrados no MeuMix. Os capitães fazem parte dos inscritos."
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
                  {captains.has(p.userId) ? (
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
