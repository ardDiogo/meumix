"use client";

import { Check, Dices, Loader2, Map as MapIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { forceCloseRound, forceMapVoting, submitTiebreakerVote } from "@/app/(app)/desempate/actions";
import { cn } from "@/lib/utils";
import type { TiebreakerRoundView, TiebreakerView, Voter } from "@/services/mix-events";
import { Avatar } from "../ui/avatar";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { MapIcon as MapEmblem } from "@/components/maps/map-icon";
import type { MapId } from "@/types/domain";

/** Mapas do mix e desempate (docs/regras-do-mix.md, seção 3). */
export function TiebreakerPanel({
  scheduleId,
  date,
  tiebreaker,
  classifiedCount,
  isClassified,
  isAdmin,
}: {
  scheduleId: string;
  date: string;
  tiebreaker: TiebreakerView;
  classifiedCount: number;
  isClassified: boolean;
  isAdmin: boolean;
}) {
  const open = tiebreaker.rounds.find((r) => r.status === "voting");
  // Round "concluído" sem empate (votação de mapas encerrada pelo admin) não aparece como desempate.
  const done = tiebreaker.rounds.filter((r) => r.status !== "voting" && r.candidates.length > r.slots);
  const [closing, startClosing] = useTransition();

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <MapIcon className="size-4 text-brand" aria-hidden />
        <h2 className="font-display text-sm font-semibold tracking-wide uppercase">Mapas do mix</h2>
        {tiebreaker.waiting ? (
          <Badge variant="brand">Aguardando votos</Badge>
        ) : tiebreaker.pending ? (
          <Badge variant="brand">Desempate em andamento</Badge>
        ) : (
          <Badge variant="win">Definidos</Badge>
        )}
      </div>
      <div className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap gap-2">
          {tiebreaker.finalMaps.map((m) => (
            <span
              key={m.id}
              className="inline-flex flex-col gap-1 rounded-md border border-brand/40 bg-brand/10 px-3 py-1.5 text-sm font-semibold"
            >
              <span className="inline-flex items-center gap-1.5">
                <MapEmblem id={m.id as MapId} size={18} />
                {m.name}
                <span
                  className="text-xs font-medium text-muted tabular"
                  title={
                    m.tiebreakVotes != null
                      ? `${m.votes} na votação de mapas e ${m.tiebreakVotes} no desempate`
                      : `${m.votes} na votação de mapas`
                  }
                >
                  {m.votes} {m.votes === 1 ? "voto" : "votos"}
                  {m.tiebreakVotes != null && ` · ${m.tiebreakVotes} no desempate`}
                </span>
                {m.random && (
                  <span
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-muted"
                    title="Decidido por sorteio"
                  >
                    <Dices className="size-3.5" /> sorteio
                  </span>
                )}
              </span>
              <VoterFaces voters={m.voters} />
            </span>
          ))}
          {tiebreaker.pending &&
            Array.from({ length: Math.max(0, 4 - tiebreaker.finalMaps.length) }, (_, i) => (
              <span
                key={i}
                className="rounded-md border border-dashed border-border-strong px-3 py-1.5 text-sm text-subtle"
              >
                A definir
              </span>
            ))}
        </div>

        {done.map((r) => (
          <p key={r.id} className="text-xs text-muted">
            Round {r.roundNumber}:{" "}
            {r.status === "resolved_random"
              ? "empate persistiu — decidido por sorteio."
              : r.winning.length
                ? `vencedores definidos (${r.votesCast} votos).`
                : `empate persistiu (${r.votesCast} votos).`}
          </p>
        ))}

        {tiebreaker.waiting && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-surface-2/60 px-3 py-2 text-sm">
            <p className="text-muted">
              <span className="font-semibold text-fg">
                {tiebreaker.waiting.voted}/{tiebreaker.waiting.total} votaram nos mapas.
              </span>{" "}
              Os mapas ficam definidos quando os votos que faltam já não mudam o resultado (com todos votando, um empate
              na última vaga abre o desempate).
            </p>
            {isAdmin && (
              <Button
                variant="ghost"
                size="sm"
                disabled={closing}
                onClick={() =>
                  confirm("Encerrar a votação de mapas com os votos atuais? Quem não votou não vota mais.") &&
                  startClosing(async () => {
                    const r = await forceMapVoting(scheduleId, date);
                    if (r.ok) toast.success(r.message);
                    else toast.error(r.message);
                  })
                }
              >
                {closing && <Loader2 className="animate-spin" />} Encerrar votação de mapas
              </Button>
            )}
          </div>
        )}

        {open && <OpenRound round={open} classifiedCount={classifiedCount} canVote={isClassified} isAdmin={isAdmin} />}
      </div>
    </Card>
  );
}

function OpenRound({
  round,
  classifiedCount,
  canVote,
  isAdmin,
}: {
  round: TiebreakerRoundView;
  classifiedCount: number;
  canVote: boolean;
  isAdmin: boolean;
}) {
  const [picked, setPicked] = useState<string[]>(round.myVote);
  const [pending, start] = useTransition();
  const toggle = (id: string) =>
    setPicked((l) => (l.includes(id) ? l.filter((x) => x !== id) : l.length < round.slots ? [...l, id] : l));
  const run = (fn: () => Promise<{ ok: boolean; message: string }>) =>
    start(async () => {
      const r = await fn();
      if (r.ok) toast.success(r.message);
      else toast.error(r.message);
    });

  return (
    <div className="rounded-lg border border-brand/40 p-4">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <div className="font-display text-sm font-semibold uppercase">Desempate — Round {round.roundNumber}</div>
        <span className="text-xs text-muted tabular">
          {round.votesCast}/{classifiedCount} votos
        </span>
      </div>
      <p className="mb-3 text-sm text-muted">
        Mapas empatados na última vaga. Escolha {round.slots} {round.slots > 1 ? "mapas" : "mapa"}.
      </p>
      <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {round.candidates.map((c) => {
          const active = picked.includes(c.id);
          return (
            <li key={c.id}>
              <button
                type="button"
                disabled={!canVote || pending}
                aria-pressed={active}
                onClick={() => toggle(c.id)}
                className={cn(
                  "flex min-h-10 w-full flex-col justify-center gap-1 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
                  active ? "border-brand bg-brand/10" : "border-border bg-surface-2 hover:border-border-strong",
                  !canVote && "cursor-default",
                )}
              >
                <span className="flex w-full items-center justify-between">
                  <span className="flex items-center gap-2">
                    <MapEmblem id={c.id as MapId} size={20} />
                    {c.name}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-muted tabular">
                    {active && <Check className="size-3.5 text-brand" />}
                    {c.votes}
                  </span>
                </span>
                <VoterFaces voters={c.voters} />
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        {canVote && (
          <Button
            variant="primary"
            className="flex-1"
            disabled={pending || picked.length !== round.slots}
            onClick={() => run(() => submitTiebreakerVote(round.id, picked))}
          >
            {pending && <Loader2 className="animate-spin" />}
            {round.myVote.length ? "Alterar voto" : "Confirmar voto"}
          </Button>
        )}
        {isAdmin && (
          <Button
            variant="ghost"
            disabled={pending}
            onClick={() => confirm("Fechar o round agora com os votos atuais?") && run(() => forceCloseRound(round.id))}
          >
            Forçar fechamento
          </Button>
        )}
      </div>
    </div>
  );
}

/** Fotos pequenas de quem votou no mapa (passe o mouse para ver o nome). */
function VoterFaces({ voters }: { voters: Voter[] }) {
  if (!voters.length) return null;
  return (
    <span
      className="flex flex-wrap items-center gap-0.5"
      aria-label={`Votaram: ${voters.map((v) => v.name).join(", ")}`}
    >
      {voters.map((v) => (
        <span key={v.userId} title={v.name}>
          <Avatar name={v.name} src={v.avatarUrl} size="xs" className="size-5 text-[9px]" />
        </span>
      ))}
    </span>
  );
}
