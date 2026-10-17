import { AlertTriangle, CalendarClock, Check, Crown, Flag, Monitor, Smartphone, Users } from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";
import { CAPTAINS, CAPTAIN_VOTES_PER_PLAYER, MAPS_IN_ROTATION } from "@/lib/mix-rules";
import { registrationWindow } from "@/lib/mix-schedule";
import { cn } from "@/lib/utils";
import { getPermissions } from "@/services/auth";
import { getNextMix } from "@/services/mix-events";
import { Avatar } from "../ui/avatar";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardHeader } from "../ui/card";
import { EmptyState } from "../ui/empty-state";
import { Table, TD, TH, THead, TR } from "../ui/table";
import { JoinButton } from "./join-button";
import { LiveRefresh } from "./live-refresh";
import { DraftPanel } from "./draft-panel";
import { SuggestionPanel } from "./suggestion-panel";
import { RemoveButton, ResetButton, StartDraftButton } from "./registration-controls";
import { VoteDialog } from "./vote-dialog";
import { ShareMixButton } from "./share-mix";
import { TiebreakerPanel } from "./tiebreaker-panel";
import { MapIcon } from "@/components/maps/map-icon";
import type { MapId } from "@/types/domain";

const TZ = "America/Sao_Paulo";
const dayMonth = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: TZ });
const hourMin = (d: Date) => d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
const weekday = (d: Date) => {
  const w = d.toLocaleDateString("pt-BR", { weekday: "long", timeZone: TZ });
  return w.charAt(0).toUpperCase() + w.slice(1);
};
const fullTime = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: TZ,
  });

async function siteUrl() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : "https://meumix.vercel.app";
}

/** Texto do convite no formato do WhatsApp (*negrito*). */
function inviteMessage(opts: {
  eventAt: Date;
  opensAt: Date;
  classified: string[];
  reserves: string[];
  maxPlayers: number;
  link: string;
}) {
  const lines = [
    `🎮 *MIX MEUMIX - ${weekday(opts.eventAt)}, ${dayMonth(opts.eventAt)} às ${hourMin(opts.eventAt)}*`,
    `⏰ Inscrições abrem às ${hourMin(opts.opensAt)} (${dayMonth(opts.opensAt)})`,
    `👥 ${opts.classified.length}/${opts.maxPlayers} jogadores classificados`,
  ];
  if (opts.classified.length) {
    lines.push("", "📋 *Jogadores:*", ...opts.classified.map((n, i) => `${i + 1}. ${n}`));
  }
  if (opts.reserves.length) {
    lines.push("", "🪑 *Suplentes:*", ...opts.reserves.map((n, i) => `${i + 1}. ${n}`));
  }
  const left = opts.maxPlayers - opts.classified.length;
  lines.push(
    "",
    left > 0
      ? `🔥 Faltam ${left} vaga${left > 1 ? "s" : ""}! Confirme sua presença com 1 toque:`
      : "✅ Vagas preenchidas! Entre como suplente com 1 toque:",
    opts.link,
  );
  return lines.join("\n");
}

/** Próximo mix com inscrições reais. Só usuários cadastrados podem participar. */
export async function NextMixPanel() {
  const { session, canManageMixes } = await getPermissions();
  let result: Awaited<ReturnType<typeof getNextMix>>;
  try {
    result = await getNextMix(session?.id ?? null);
  } catch (e) {
    console.error("[NextMixPanel]", e);
    return (
      <Card className="mb-4">
        <EmptyState
          icon={AlertTriangle}
          title="Não foi possível carregar o mix"
          description="Tente recarregar a página em instantes."
          className="py-8"
        />
      </Card>
    );
  }
  if (result.status === "not_configured") return null;

  if (result.status === "none") {
    return (
      <Card className="mb-4">
        <EmptyState
          icon={CalendarClock}
          title="Nenhum mix agendado"
          description={canManageMixes ? "Crie um mix no painel de administração." : "O próximo mix aparecerá aqui."}
          className="py-8"
        />
      </Card>
    );
  }

  const { schedule, occurrence, organizer, registrations, votes, draft } = result.mix;
  const nameOf = (id: string) => registrations.find((r) => r.userId === id)?.displayName ?? "Jogador";
  const now = new Date();
  const regWindow = registrationWindow(occurrence, now);
  const mine = session ? registrations.find((r) => r.userId === session.id) : undefined;
  const classifiedList = registrations.filter((r) => r.status === "classified");
  const classified = classifiedList.length;
  const full = classified >= schedule.maxPlayers;
  const votesNeeded = schedule.maxPlayers * CAPTAIN_VOTES_PER_PLAYER;
  const message = inviteMessage({
    eventAt: occurrence.eventAt,
    opensAt: occurrence.opensAt,
    classified: classifiedList.map((r) => r.displayName),
    reserves: registrations.filter((r) => r.status === "reserve").map((r) => r.displayName),
    maxPlayers: schedule.maxPlayers,
    link: `${await siteUrl()}/confirmar`,
  });
  const topMaps = votes.mapTally.slice(0, MAPS_IN_ROTATION);
  const topCaptains = votes.captainTally.slice(0, CAPTAINS);

  return (
    <section aria-label="Próximo mix" className="mb-4 space-y-4">
      <LiveRefresh scheduleId={schedule.id} />
      <Card>
        <div className="flex flex-col gap-4 p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-xl font-bold tracking-tight">Participar do mix</h2>
                {regWindow === "open" && <Badge variant="win">Inscrições abertas</Badge>}
                {regWindow === "not_open" && <Badge variant="neutral">Inscrições em breve</Badge>}
                {regWindow === "closed" && <Badge variant="brand">Mix em andamento</Badge>}
              </div>
              <p className="mt-1 text-sm text-muted">
                {organizer && (
                  <>
                    Organizado por <span className="text-fg">{organizer}</span> ·{" "}
                  </>
                )}
                Mix: <span className="text-fg">{weekday(occurrence.eventAt)}</span>,{" "}
                <span className="text-fg tabular">
                  {dayMonth(occurrence.eventAt)} às {hourMin(occurrence.eventAt)}
                </span>{" "}
                · Inscrições abrem:{" "}
                <span className="text-fg tabular">
                  {dayMonth(occurrence.opensAt)} às {hourMin(occurrence.opensAt)}
                </span>
              </p>
              {mine && (
                <p className="mt-2 text-sm">
                  Você está inscrito na posição <span className="font-semibold text-brand">#{mine.position}</span> —{" "}
                  {mine.status === "classified" ? "classificado" : "suplente"}.
                </p>
              )}
            </div>
            <div className="-ml-2 flex shrink-0 flex-wrap items-center gap-1 sm:ml-0 sm:justify-end">
              {mine?.status === "classified" && (
                <VoteDialog
                  scheduleId={schedule.id}
                  date={occurrence.date}
                  maps={votes.maps}
                  candidates={classifiedList
                    .filter((r) => r.userId !== session?.id)
                    .map((r) => ({ userId: r.userId, displayName: r.displayName, avatarUrl: r.avatarUrl }))}
                  myMaps={votes.mine.maps}
                  myCaptains={votes.mine.captains}
                  captainsLocked={!!draft}
                  mandatory={full}
                  suggestion={
                    !draft && result.mix.suggestion?.status === "pending"
                      ? {
                          teamA: result.mix.suggestion.teamA.map((id) => nameOf(id)),
                          teamB: result.mix.suggestion.teamB.map((id) => nameOf(id)),
                          probA: result.mix.suggestion.probA,
                          myVote: result.mix.suggestion.myVote,
                        }
                      : null
                  }
                />
              )}
              {canManageMixes && full && !draft && <StartDraftButton scheduleId={schedule.id} date={occurrence.date} />}
              {canManageMixes && draft?.status === "completed" && !result.mix.finalizedMatchId && (
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/admin/finalizar?agenda=${schedule.id}&data=${occurrence.date}`}>
                    <Flag /> Finalizar mix
                  </Link>
                </Button>
              )}
              {canManageMixes && registrations.length > 0 && (
                <ResetButton scheduleId={schedule.id} date={occurrence.date} />
              )}
              <ShareMixButton message={message} />
            </div>
          </div>
          {result.mix.finalizedMatchId && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-win/30 bg-win/10 px-3 py-2 text-sm">
              <span className="flex items-center gap-2 font-medium text-win">
                <Check className="size-4" /> Mix finalizado — ELO e ranking atualizados.
              </span>
              <Link href={`/mixes/${result.mix.finalizedMatchId}`} className="font-medium text-fg hover:text-brand">
                Ver resultado →
              </Link>
            </div>
          )}
          <JoinButton
            scheduleId={schedule.id}
            date={occurrence.date}
            loggedIn={!!session}
            registered={!!mine}
            opensAt={occurrence.opensAt.getTime()}
            eventAt={occurrence.eventAt.getTime()}
            penaltyDelay={result.mix.myPenaltyDelay}
          />
        </div>
      </Card>

      {draft && (
        <DraftPanel
          scheduleId={schedule.id}
          date={occurrence.date}
          draft={draft}
          names={Object.fromEntries(registrations.map((r) => [r.userId, r.displayName]))}
          avatars={Object.fromEntries(registrations.map((r) => [r.userId, r.avatarUrl]))}
          classified={classifiedList.map((r) => r.userId)}
          viewerId={session?.id ?? null}
          isAdmin={canManageMixes}
          probA={result.mix.draftProbA}
        />
      )}

      {!draft && result.mix.suggestion?.status === "pending" && (
        <SuggestionPanel
          scheduleId={schedule.id}
          date={occurrence.date}
          suggestion={result.mix.suggestion}
          names={Object.fromEntries(registrations.map((r) => [r.userId, r.displayName]))}
          avatars={Object.fromEntries(registrations.map((r) => [r.userId, r.avatarUrl]))}
          canVote={mine?.status === "classified"}
          isAdmin={canManageMixes}
        />
      )}

      {draft?.status === "completed" && (
        <TiebreakerPanel
          tiebreaker={result.mix.tiebreaker}
          classifiedCount={classified}
          isClassified={mine?.status === "classified"}
          isAdmin={canManageMixes}
        />
      )}

      <Card>
        <CardHeader
          title={`Jogadores inscritos (${classified}/${schedule.maxPlayers} classificados)`}
          description="Lista ordenada por horário de inscrição. Após as vagas, os inscritos entram como reservas."
        />
        {registrations.length ? (
          <Table>
            <THead>
              <TR>
                <TH className="w-12 text-center">#</TH>
                <TH className="min-w-40">Nick</TH>
                <TH>Status</TH>
                <TH className="text-center">Device</TH>
                <TH>Mapas</TH>
                <TH>Horário</TH>
                <TH title="Votos de capitão dados / recebidos">Votação</TH>
                {canManageMixes && <TH className="text-right">Ações</TH>}
              </TR>
            </THead>
            <tbody>
              {registrations.map((r) => (
                <TR key={r.id} className={cn(r.userId === session?.id && "bg-brand/5")}>
                  <TD className="text-center font-display font-bold text-muted">{r.position}</TD>
                  <TD>
                    <div className="flex items-center gap-2">
                      <Avatar name={r.displayName} src={r.avatarUrl} size="xs" />
                      <span className="font-medium">{r.displayName}</span>
                      {r.penalty && (
                        <span
                          className="inline-flex animate-pulse items-center text-loss"
                          title={`Punição: ${r.penalty.reason} (atraso de ${r.penalty.delaySeconds}s)`}
                        >
                          <AlertTriangle className="size-3.5" aria-label={`Punição: ${r.penalty.reason}`} />
                        </span>
                      )}
                    </div>
                  </TD>
                  <TD>
                    {r.status === "classified" ? (
                      <Badge variant="win">Classificado</Badge>
                    ) : (
                      <Badge variant="neutral">Reserva</Badge>
                    )}
                  </TD>
                  <TD className="text-center text-muted">
                    {r.device === "mobile" ? (
                      <Smartphone className="mx-auto size-4" aria-label="Celular" />
                    ) : r.device === "desktop" ? (
                      <Monitor className="mx-auto size-4" aria-label="Computador" />
                    ) : (
                      "—"
                    )}
                  </TD>
                  <TD className="text-xs">
                    {r.status !== "classified" ? (
                      <span className="text-subtle">—</span>
                    ) : r.mapVoted ? (
                      <span className="inline-flex items-center gap-1 text-win">
                        <Check className="size-3.5" /> Votou
                      </span>
                    ) : (
                      <span className="text-muted">Não votou</span>
                    )}
                  </TD>
                  <TD className="text-muted">{fullTime(r.createdAt)}</TD>
                  <TD>
                    {r.status === "classified" ? (
                      <div className="flex items-center gap-3">
                        <span className="rounded-sm bg-surface-2 px-1.5 py-0.5 text-xs font-semibold">
                          {r.captainVotesGiven}/{CAPTAIN_VOTES_PER_PLAYER}
                        </span>
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 text-xs",
                            r.captainVotesReceived ? "text-brand" : "text-subtle",
                          )}
                          title="Votos para capitão recebidos"
                        >
                          <Crown className="size-3.5" /> ({r.captainVotesReceived})
                        </span>
                      </div>
                    ) : (
                      <span className="text-subtle">—</span>
                    )}
                  </TD>
                  {canManageMixes && (
                    <TD className="text-right">
                      <RemoveButton registrationId={r.id} name={r.displayName} />
                    </TD>
                  )}
                </TR>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState
            icon={Users}
            title="Nenhum inscrito ainda"
            description="Seja o primeiro a garantir sua vaga."
            className="py-8"
          />
        )}

        {(topMaps.length > 0 || topCaptains.length > 0) && (
          <div className="grid gap-3 border-t border-border px-4 py-3 text-sm sm:grid-cols-2">
            <div>
              <div className="mb-1 text-[11px] font-semibold tracking-wider text-muted uppercase">
                Mapas mais votados
              </div>
              {topMaps.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {topMaps.map((m) => (
                    <Badge key={m.id} variant="brand" className="gap-1">
                      <MapIcon id={m.id as MapId} size={16} />
                      {m.name} · {m.votes}
                    </Badge>
                  ))}
                </div>
              ) : (
                <span className="text-subtle">Sem votos ainda</span>
              )}
            </div>
            <div>
              <div className="mb-1 text-[11px] font-semibold tracking-wider text-muted uppercase">
                Capitães mais votados
              </div>
              {topCaptains.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {topCaptains.map((c) => (
                    <Badge key={c.userId} variant="brand">
                      <Crown /> {c.displayName} · {c.votes}
                    </Badge>
                  ))}
                </div>
              ) : (
                <span className="text-subtle">Sem votos ainda</span>
              )}
            </div>
          </div>
        )}

        <div className="border-t border-border px-4 py-3 text-center text-sm text-muted">
          Necessário <span className="font-semibold text-fg">{schedule.maxPlayers} jogadores classificados</span> (
          {classified}/{schedule.maxPlayers}) e{" "}
          <span className="font-semibold text-fg">
            {votes.captainVotesCast}/{votesNeeded} votações
          </span>{" "}
          para iniciar a seleção de equipes (começa antes se os 2 capitães já estiverem garantidos).
        </div>
      </Card>
    </section>
  );
}
