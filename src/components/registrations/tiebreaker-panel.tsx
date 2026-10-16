"use client";

import { Check, Dices, Loader2, Map as MapIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { forceCloseRound, submitTiebreakerVote } from "@/app/(app)/desempate/actions";
import { cn } from "@/lib/utils";
import type { TiebreakerRoundView, TiebreakerView } from "@/services/mix-events";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card } from "../ui/card";

/** Mapas do mix e desempate (docs/regras-do-mix.md, seção 3). */
export function TiebreakerPanel({
  tiebreaker,
  classifiedCount,
  isClassified,
  isAdmin,
}: {
  tiebreaker: TiebreakerView;
  classifiedCount: number;
  isClassified: boolean;
  isAdmin: boolean;
}) {
  const open = tiebreaker.rounds.find((r) => r.status === "voting");
  const done = tiebreaker.rounds.filter((r) => r.status !== "voting");

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <MapIcon className="size-4 text-brand" aria-hidden />
        <h2 className="font-display text-sm font-semibold tracking-wide uppercase">Mapas do mix</h2>
        {tiebreaker.pending ? (
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
              className="inline-flex items-center gap-1.5 rounded-md border border-brand/40 bg-brand/10 px-3 py-1.5 text-sm font-semibold"
            >
              {m.name}
              {m.random && (
                <span
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-muted"
                  title="Decidido por sorteio"
                >
                  <Dices className="size-3.5" /> sorteio
                </span>
              )}
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
                  "flex h-10 w-full items-center justify-between rounded-md border px-3 text-sm font-medium transition-colors",
                  active ? "border-brand bg-brand/10" : "border-border bg-surface-2 hover:border-border-strong",
                  !canVote && "cursor-default",
                )}
              >
                {c.name}
                <span className="flex items-center gap-1 text-xs text-muted tabular">
                  {active && <Check className="size-3.5 text-brand" />}
                  {c.votes}
                </span>
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
