"use client";

import { ArrowRightLeft, Check, Loader2, RotateCcw } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { answerDraftReview } from "@/app/(app)/draft/actions";
import type { DraftReviewView } from "@/services/draft-review";
import { Button } from "../ui/button";

/**
 * Troca no time tirado: quem saiu, quem entrou e a pergunta para os capitães
 * ("manter o time" precisa dos dois; "tirar novamente" basta um).
 */
export function DraftReviewBanner({
  scheduleId,
  date,
  review,
  mySide,
  name,
  captainA,
  captainB,
}: {
  scheduleId: string;
  date: string;
  review: DraftReviewView;
  mySide: "a" | "b" | null;
  name: (id: string | null) => string;
  captainA: string;
  captainB: string;
}) {
  const [pending, start] = useTransition();
  const entered = review.changes.filter((c) => c.in);
  if (!entered.length) return null;
  const answer = (keep: boolean) =>
    start(async () => {
      const r = await answerDraftReview(scheduleId, date, keep);
      if (r.ok) toast.success(r.message);
      else toast.error(r.message);
    });
  const myVote = mySide === "a" ? review.voteA : mySide === "b" ? review.voteB : null;
  const kept = review.status === "kept";
  const status = (vote: boolean | null) => (vote ? "manter ✓" : "aguardando");

  return (
    <div
      className={
        kept
          ? "border-b border-border bg-win/5 px-4 py-3 text-sm"
          : "border-b border-brand/40 bg-brand/10 px-4 py-3 text-sm"
      }
    >
      <div className="flex items-start gap-2">
        <ArrowRightLeft className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="font-semibold">{kept ? "Time mantido com a troca" : "Troca no time"}</div>
          <ul className="text-muted">
            {entered.map((c, i) => (
              <li key={i}>
                {c.out ? (
                  <>
                    <span className="text-fg">{name(c.out)}</span> saiu e{" "}
                    <span className="font-medium text-fg">{name(c.in)}</span> entrou no lugar (Time {c.side})
                  </>
                ) : (
                  <>
                    <span className="font-medium text-fg">{name(c.in)}</span> entrou na vaga aberta (Time {c.side})
                  </>
                )}
              </li>
            ))}
          </ul>
          {!kept && (
            <p className="text-xs text-muted">
              Os capitães decidem: manter o time (precisa dos dois) ou tirar novamente (basta um). Capitão{" "}
              {name(captainA)}: {status(review.voteA)} · Capitão {name(captainB)}: {status(review.voteB)}.
            </p>
          )}
        </div>
      </div>
      {!kept && mySide && (
        <div className="mt-3 flex flex-wrap gap-2 pl-6">
          {myVote ? (
            <span className="flex items-center gap-1.5 text-sm font-medium text-win">
              <Check className="size-4" /> Você escolheu manter o time. Aguardando o outro capitão.
            </span>
          ) : (
            <Button variant="primary" size="sm" disabled={pending} onClick={() => answer(true)}>
              {pending ? <Loader2 className="animate-spin" /> : <Check />} Manter o time
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            disabled={pending}
            onClick={() =>
              confirm("Tirar o time novamente? A seleção recomeça do pedra, papel ou tesoura.") && answer(false)
            }
          >
            <RotateCcw /> Tirar novamente
          </Button>
        </div>
      )}
    </div>
  );
}
