"use client";

import { Bell, CalendarClock, Check, Loader2, Pencil, Server, Shuffle, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  approveSchedule,
  cancelProposal,
  editMatch,
  generateMatches,
  proposeDate,
  respondProposal,
  setMatchStatus,
  setSchedule,
} from "@/app/(app)/campeonatos/schedule-actions";
import { formatWhen, MATCH_STATUS_LABEL, toLocal, type MatchStatus } from "@/lib/championship-schedule";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader } from "../ui/card";
import { Input, Select } from "../ui/input";
import type { BoardTeam } from "./draft-board";
import { TeamLogo } from "./team-logo";

export type CalMatch = {
  id: string;
  round: number;
  homeTeam: string | null;
  awayTeam: string | null;
  bestOf: number;
  scheduledAt: string | null;
  server: number | null;
  status: MatchStatus;
};
export type CalProposal = {
  id: string;
  matchId: string;
  proposedByTeam: string;
  startsAt: string;
  note: string;
  status: string;
};

type Result = { ok: boolean; message: string };

const STATUS_VARIANT: Record<MatchStatus, "neutral" | "brand" | "win" | "loss"> = {
  pending: "neutral",
  proposed: "brand",
  approval: "brand",
  scheduled: "win",
  live: "win",
  finished: "neutral",
  postponed: "loss",
  cancelled: "loss",
};

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<Result>, opts?: { confirm?: string; after?: () => void }) => {
    if (opts?.confirm && !confirm(opts.confirm)) return;
    start(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(r.message);
        opts?.after?.();
      } else toast.error(r.message);
      router.refresh();
    });
  };
  return [pending, run] as const;
}

/** Atualiza sozinho quando alguém propõe, responde ou a organização aprova. */
function LiveCalendar({ championshipId }: { championshipId: string }) {
  const router = useRouter();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 300);
    };
    const poll = setInterval(() => router.refresh(), 20000);
    const supabase = getSupabaseBrowserClient();
    const channel = supabase?.channel(`calendario-${championshipId}`);
    if (supabase && channel) {
      for (const table of ["championship_matches", "championship_match_proposals"])
        channel.on(
          "postgres_changes",
          { event: "*", schema: "public", table, filter: `championship_id=eq.${championshipId}` },
          refresh,
        );
      channel.subscribe();
    }
    return () => {
      clearTimeout(timer);
      clearInterval(poll);
      if (supabase && channel) void supabase.removeChannel(channel);
    };
  }, [championshipId, router]);
  return null;
}

export function CalendarBoard({
  championshipId,
  teams,
  matches,
  proposals,
  viewerId,
  isManager,
  servers,
  windowText,
  canGenerate,
  draftDone,
  slug,
  scores,
}: {
  slug: string;
  /** Mapas vencidos por cada lado, nos jogos com placar. */
  scores: Record<string, { home: number; away: number }>;
  championshipId: string;
  teams: BoardTeam[];
  matches: CalMatch[];
  proposals: CalProposal[];
  viewerId: string | null;
  isManager: boolean;
  servers: number;
  windowText: string;
  canGenerate: boolean;
  draftDone: boolean;
}) {
  const [pending, run] = useRun();
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const myTeams = new Set(teams.filter((t) => viewerId && t.captainId === viewerId).map((t) => t.id));
  const open = new Map(proposals.filter((p) => p.status === "pending").map((p) => [p.matchId, p]));
  const rounds = [...new Set(matches.map((m) => m.round))].sort((a, b) => a - b);

  // Pendências de quem está vendo.
  const toAnswer = matches.filter((m) => {
    const p = open.get(m.id);
    return p && [m.homeTeam, m.awayTeam].some((t) => t && myTeams.has(t) && t !== p.proposedByTeam);
  });
  const toSchedule = matches.filter(
    (m) => ["pending", "postponed"].includes(m.status) && [m.homeTeam, m.awayTeam].some((t) => t && myTeams.has(t)),
  );
  const toApprove = isManager ? matches.filter((m) => m.status === "approval") : [];

  return (
    <div className="space-y-4">
      <LiveCalendar championshipId={championshipId} />

      {(toAnswer.length > 0 || toApprove.length > 0 || toSchedule.length > 0) && (
        <Card className="border-brand/50">
          <CardContent className="flex items-start gap-3 text-sm">
            <Bell className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
            <ul className="space-y-0.5">
              {toAnswer.length > 0 && (
                <li className="font-semibold">
                  {toAnswer.length === 1 ? "1 proposta de data" : `${toAnswer.length} propostas de data`} esperando a
                  sua resposta.
                </li>
              )}
              {toApprove.length > 0 && (
                <li className="font-semibold">
                  {toApprove.length === 1 ? "1 jogo" : `${toApprove.length} jogos`} esperando a aprovação da
                  organização.
                </li>
              )}
              {toSchedule.length > 0 && (
                <li className="text-muted">
                  Seu time tem {toSchedule.length === 1 ? "1 jogo" : `${toSchedule.length} jogos`} sem data: proponha um
                  horário ao adversário.
                </li>
              )}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <span className="flex items-center gap-2 text-muted">
            <CalendarClock className="size-4 text-brand" aria-hidden /> {windowText} · até {servers}{" "}
            {servers === 1 ? "servidor" : "servidores"}
          </span>
          {isManager && canGenerate && (
            <Button
              variant="primary"
              size="sm"
              disabled={pending || !draftDone}
              title={draftDone ? undefined : "Conclua o draft primeiro"}
              onClick={() =>
                run(() => generateMatches(championshipId), {
                  confirm: matches.length
                    ? "Gerar os confrontos de novo? Os atuais (ainda sem data) serão substituídos."
                    : undefined,
                })
              }
            >
              {pending ? <Loader2 className="animate-spin" /> : <Shuffle />}{" "}
              {matches.length ? "Gerar de novo" : "Gerar confrontos"}
            </Button>
          )}
        </CardContent>
      </Card>

      {!matches.length ? (
        <Card className="p-6 text-center text-sm text-muted">
          {draftDone
            ? isManager
              ? "Gere os confrontos da fase classificatória."
              : "Os confrontos aparecem aqui quando a organização gerar o calendário."
            : "Os confrontos são gerados depois do draft."}
        </Card>
      ) : (
        rounds.map((round) => {
          const games = matches.filter((m) => m.round === round);
          const playing = new Set(games.flatMap((m) => [m.homeTeam, m.awayTeam]));
          const off = teams.filter((t) => !playing.has(t.id));
          return (
            <Card key={round}>
              <CardHeader
                title={`Rodada ${round}`}
                description={off.length ? `Folga: ${off.map((t) => t.name).join(", ")}` : undefined}
              />
              <ul className="divide-y divide-border">
                {games.map((m) => (
                  <MatchItem
                    key={m.id}
                    championshipId={championshipId}
                    match={m}
                    teamById={teamById}
                    proposal={open.get(m.id) ?? null}
                    myTeams={myTeams}
                    isManager={isManager}
                    servers={servers}
                    rounds={Math.max(...rounds)}
                    href={`/campeonatos/${slug}/jogos/${m.id}`}
                    score={scores[m.id] ?? null}
                  />
                ))}
              </ul>
            </Card>
          );
        })
      )}
    </div>
  );
}

type Panel = "propose" | "direct" | "edit" | null;

function MatchItem({
  championshipId,
  match: m,
  teamById,
  proposal,
  myTeams,
  isManager,
  servers,
  rounds,
  href,
  score,
}: {
  href: string;
  score: { home: number; away: number } | null;
  championshipId: string;
  match: CalMatch;
  teamById: Map<string, BoardTeam>;
  proposal: CalProposal | null;
  myTeams: Set<string>;
  isManager: boolean;
  servers: number;
  rounds: number;
}) {
  const [pending, run] = useRun();
  const [panel, setPanel] = useState<Panel>(null);
  const [when, setWhen] = useState(m.scheduledAt ? toLocal(m.scheduledAt) : "");
  const [note, setNote] = useState("");
  const [server, setServer] = useState<string>(m.server ? String(m.server) : "");
  const [round, setRound] = useState(m.round);
  const [swap, setSwap] = useState(false);
  const home = m.homeTeam ? teamById.get(m.homeTeam) : null;
  const away = m.awayTeam ? teamById.get(m.awayTeam) : null;
  const mySide = [m.homeTeam, m.awayTeam].find((t) => t && myTeams.has(t)) ?? null;
  const canPropose = !!mySide && ["pending", "proposed", "postponed"].includes(m.status);
  const iAnswer = !!proposal && !!mySide && mySide !== proposal.proposedByTeam;
  const iProposed = !!proposal && mySide === proposal.proposedByTeam;
  const closed = m.status === "finished" || m.status === "live";
  const toggle = (p: Panel) => setPanel((cur) => (cur === p ? null : p));
  const serverOptions = (
    <Select
      aria-label="Servidor"
      className="h-8 w-36 text-xs"
      value={server}
      onChange={(e) => setServer(e.target.value)}
    >
      <option value="">Servidor livre</option>
      {Array.from({ length: servers }, (_, i) => (
        <option key={i + 1} value={i + 1}>
          Servidor {i + 1}
        </option>
      ))}
    </Select>
  );

  return (
    <li className="space-y-2.5 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Link
          href={href}
          className="group flex min-w-0 basis-full items-center gap-2 font-semibold sm:flex-1 sm:basis-auto"
        >
          {home && <TeamLogo team={home} size={28} />}
          <span className={cn("truncate group-hover:text-brand", score && score.home < score.away && "text-muted")}>
            {home?.name ?? "A definir"}
          </span>
          {score ? (
            <span className="px-1 font-display text-base tabular">
              {score.home}
              <span className="mx-1 text-subtle">:</span>
              {score.away}
            </span>
          ) : (
            <span className="px-1 text-xs font-normal text-subtle">×</span>
          )}
          <span className={cn("truncate group-hover:text-brand", score && score.away < score.home && "text-muted")}>
            {away?.name ?? "A definir"}
          </span>
          {away && <TeamLogo team={away} size={28} />}
        </Link>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant={STATUS_VARIANT[m.status]}>{MATCH_STATUS_LABEL[m.status]}</Badge>
          <span className="text-muted">MD{m.bestOf}</span>
          {m.scheduledAt && ["approval", "scheduled", "live", "finished"].includes(m.status) && (
            <span className="font-semibold text-fg">{formatWhen(m.scheduledAt)}</span>
          )}
          {m.server && (
            <span className="flex items-center gap-1 text-muted">
              <Server className="size-3.5" aria-hidden /> {m.server}
            </span>
          )}
        </div>
      </div>

      {proposal && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-brand/30 bg-brand/8 px-3 py-2 text-sm">
          <span className="min-w-0 flex-1">
            <span className="font-semibold">{teamById.get(proposal.proposedByTeam)?.name}</span> propôs{" "}
            <span className="font-semibold text-brand">{formatWhen(proposal.startsAt)}</span>
            {proposal.note && <span className="text-muted"> · “{proposal.note}”</span>}
          </span>
          {iAnswer && (
            <>
              <Button
                variant="primary"
                size="sm"
                disabled={pending}
                onClick={() => run(() => respondProposal(championshipId, proposal.id, true))}
              >
                <Check /> Aceitar
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => run(() => respondProposal(championshipId, proposal.id, false))}
              >
                <X /> Recusar
              </Button>
            </>
          )}
          {(iProposed || isManager) && !iAnswer && (
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => run(() => cancelProposal(championshipId, proposal.id))}
            >
              Retirar proposta
            </Button>
          )}
        </div>
      )}

      {/* Ações */}
      {!closed && (canPropose || isManager) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {canPropose && (
            <Button variant={panel === "propose" ? "secondary" : "outline"} size="sm" onClick={() => toggle("propose")}>
              <CalendarClock /> {proposal ? (iAnswer ? "Propor outra data" : "Mudar proposta") : "Propor data"}
            </Button>
          )}
          {isManager && m.status === "approval" && (
            <>
              {serverOptions}
              <Button
                variant="primary"
                size="sm"
                disabled={pending}
                onClick={() => run(() => approveSchedule(championshipId, m.id, server ? Number(server) : null))}
              >
                <Check /> Aprovar
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() =>
                  run(() => setMatchStatus(championshipId, m.id, "pending"), {
                    confirm: "Recusar o horário combinado? O jogo volta para Aguardando agendamento.",
                  })
                }
              >
                Recusar horário
              </Button>
            </>
          )}
          {isManager && (
            <>
              <Button variant="ghost" size="sm" onClick={() => toggle("direct")}>
                Marcar direto
              </Button>
              <Button variant="ghost" size="sm" onClick={() => toggle("edit")}>
                <Pencil /> Editar
              </Button>
              {m.status === "postponed" || m.status === "cancelled" ? (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => run(() => setMatchStatus(championshipId, m.id, "pending"))}
                >
                  Reabrir
                </Button>
              ) : (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      run(() => setMatchStatus(championshipId, m.id, "postponed"), { confirm: "Adiar este jogo?" })
                    }
                  >
                    Adiar
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-loss hover:text-loss"
                    disabled={pending}
                    onClick={() =>
                      run(() => setMatchStatus(championshipId, m.id, "cancelled"), { confirm: "Cancelar este jogo?" })
                    }
                  >
                    Cancelar
                  </Button>
                </>
              )}
            </>
          )}
        </div>
      )}

      {panel === "propose" && (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => proposeDate(championshipId, m.id, when, note), {
              after: () => {
                setPanel(null);
                setNote("");
              },
            });
          }}
        >
          <Input
            type="datetime-local"
            aria-label="Data e hora"
            className="h-8 w-auto text-xs"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            required
          />
          <Input
            aria-label="Recado (opcional)"
            placeholder="Recado (opcional)"
            maxLength={200}
            className="h-8 max-w-56 text-xs"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <Button type="submit" variant="primary" size="sm" disabled={pending || !when}>
            {pending && <Loader2 className="animate-spin" />} Enviar proposta
          </Button>
        </form>
      )}
      {panel === "direct" && (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => setSchedule(championshipId, m.id, when, server ? Number(server) : null), {
              after: () => setPanel(null),
            });
          }}
        >
          <Input
            type="datetime-local"
            aria-label="Data e hora"
            className="h-8 w-auto text-xs"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            required
          />
          {serverOptions}
          <Button type="submit" variant="primary" size="sm" disabled={pending || !when}>
            Agendar
          </Button>
        </form>
      )}
      {panel === "edit" && (
        <form
          className="flex flex-wrap items-center gap-3 text-sm"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => editMatch(championshipId, m.id, { round, swap }), {
              after: () => {
                setPanel(null);
                setSwap(false);
              },
            });
          }}
        >
          <Select
            aria-label="Rodada"
            className="h-8 w-32 text-xs"
            value={round}
            onChange={(e) => setRound(Number(e.target.value))}
          >
            {Array.from({ length: rounds + 1 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                Rodada {i + 1}
              </option>
            ))}
          </Select>
          <label className="flex items-center gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={swap}
              onChange={(e) => setSwap(e.target.checked)}
              className={cn("size-4 accent-[var(--color-brand)]")}
            />
            Inverter mando
          </label>
          <Button type="submit" variant="primary" size="sm" disabled={pending}>
            Salvar
          </Button>
        </form>
      )}
    </li>
  );
}
