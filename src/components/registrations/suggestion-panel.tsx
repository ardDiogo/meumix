"use client";

import { Check, Loader2, Scale, ThumbsDown, ThumbsUp, X } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { decideSuggestion, voteSuggestion } from "@/app/(app)/inscricoes/suggestion-actions";
import { cn } from "@/lib/utils";
import type { SuggestionView } from "@/services/team-suggestion";
import { TeamDot } from "../mixes/badges";
import { Avatar } from "../ui/avatar";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { WinProbability } from "./win-probability";

/** Sugestão de times balanceados: os 10 classificados votam (aceita com 80%). */
export function SuggestionPanel({
  scheduleId,
  date,
  suggestion,
  names,
  avatars,
  canVote,
  isAdmin,
}: {
  scheduleId: string;
  date: string;
  suggestion: SuggestionView;
  names: Record<string, string>;
  avatars: Record<string, string | null>;
  canVote: boolean;
  isAdmin: boolean;
}) {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; message: string }>) =>
    start(async () => {
      const r = await fn();
      if (r.ok) toast.success(r.message);
      else toast.error(r.message);
    });
  const nameA = `Time ${names[suggestion.teamA[0]!] ?? "A"}`;
  const nameB = `Time ${names[suggestion.teamB[0]!] ?? "B"}`;
  const voted = suggestion.agree + suggestion.disagree;

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Scale className="size-4 text-brand" aria-hidden />
          <h3 className="font-display text-sm font-semibold tracking-wide uppercase">Sugestão de times</h3>
          <Badge variant="brand">Votação</Badge>
        </div>
        {isAdmin && (
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => run(() => decideSuggestion(scheduleId, date, true))}
            >
              <Check /> Confirmar times
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => run(() => decideSuggestion(scheduleId, date, false))}
            >
              <X /> Ir para capitães
            </Button>
          </div>
        )}
      </div>
      <div className="space-y-4 p-4 sm:p-5">
        <p className="text-sm text-muted">
          Times montados pelo nível, win rate e lanternas
          {suggestion.usesCsrep ? ", com ajuste leve pelo HLTV do CSRep," : ""} testando as 252 combinações. Com{" "}
          {suggestion.needed} de 10 concordando, os times valem; senão, o mix segue para a votação de capitães.
        </p>
        <WinProbability probA={suggestion.probA} nameA={nameA} nameB={nameB} />
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ["A", suggestion.teamA, suggestion.scoreA],
              ["B", suggestion.teamB, suggestion.scoreB],
            ] as const
          ).map(([side, ids, score]) => (
            <div key={side} className="rounded-lg border border-border bg-surface-2/50 p-3">
              <div className="mb-2 flex items-center justify-between text-sm font-semibold">
                <span className="flex items-center gap-2">
                  <TeamDot side={side} /> {side === "A" ? nameA : nameB}
                </span>
                <span className="text-xs text-muted tabular">{Math.round(score)} pts</span>
              </div>
              <ul className="space-y-1.5">
                {ids.map((id) => (
                  <li key={id} className="flex items-center gap-2 text-sm">
                    <Avatar name={names[id] ?? "?"} src={avatars[id]} size="xs" />
                    <span className="truncate">{names[id] ?? "Jogador"}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-muted tabular">
            {voted}/10 votaram · <span className="text-win">{suggestion.agree} concordam</span> ·{" "}
            <span className="text-loss">{suggestion.disagree} não</span>
          </div>
          {canVote && (
            <div className="flex gap-2">
              <Button
                variant={suggestion.myVote === true ? "primary" : "secondary"}
                disabled={pending}
                onClick={() => run(() => voteSuggestion(scheduleId, date, true))}
              >
                {pending ? <Loader2 className="animate-spin" /> : <ThumbsUp />} Concordo
              </Button>
              <Button
                variant="secondary"
                disabled={pending}
                className={cn(suggestion.myVote === false && "border-loss text-loss")}
                onClick={() => run(() => voteSuggestion(scheduleId, date, false))}
              >
                <ThumbsDown /> Não concordo
              </Button>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
