"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Check, Crown, Loader2, Map as MapIcon, Vote, X } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { submitCaptainVotes, submitMapVotes } from "@/app/(app)/inscricoes/actions";
import { CAPTAIN_VOTES_PER_PLAYER, MAP_VOTES_PER_PLAYER } from "@/lib/mix-rules";
import { cn } from "@/lib/utils";
import { Avatar } from "../ui/avatar";
import { Button } from "../ui/button";

type Step = "captains" | "maps" | "done";

/**
 * Votação de capitães e mapas (docs/regras-do-mix.md, seções 3, 4 e 8).
 * Com `mandatory`, a janela abre sozinha e não pode ser fechada enquanto
 * houver votação pendente.
 */
export function VoteDialog({
  scheduleId,
  date,
  maps,
  candidates,
  myMaps,
  myCaptains,
  captainsLocked,
  mandatory,
}: {
  scheduleId: string;
  date: string;
  maps: { id: string; name: string }[];
  candidates: { userId: string; displayName: string; avatarUrl?: string | null }[];
  myMaps: string[];
  myCaptains: string[];
  /** A disputa de capitães começou: votos de capitão encerrados (pula para mapas). */
  captainsLocked: boolean;
  mandatory: boolean;
}) {
  const pendingCaptains = !captainsLocked && myCaptains.length === 0 && candidates.length > 0;
  const pendingMaps = myMaps.length !== MAP_VOTES_PER_PLAYER;
  const firstStep: Step = pendingCaptains ? "captains" : pendingMaps || captainsLocked ? "maps" : "captains";
  const locked = mandatory && (pendingCaptains || pendingMaps);

  const [open, setOpen] = useState(locked);
  const [step, setStep] = useState<Step>(firstStep);
  const [captains, setCaptains] = useState<string[]>(myCaptains);
  const [chosenMaps, setChosenMaps] = useState<string[]>(myMaps);
  const [saving, start] = useTransition();

  const toggle = (list: string[], id: string, max: number) =>
    list.includes(id) ? list.filter((x) => x !== id) : list.length < max ? [...list, id] : list;

  const save = () =>
    start(async () => {
      if (step === "captains") {
        const r = await submitCaptainVotes(scheduleId, date, captains);
        if (!r.ok) return void toast.error(r.message);
        toast.success(r.message);
        setStep(pendingMaps ? "maps" : "done");
      } else if (step === "maps") {
        const r = await submitMapVotes(scheduleId, date, chosenMaps);
        if (!r.ok) return void toast.error(r.message);
        toast.success(r.message);
        setStep("done");
      }
    });

  const canClose = !locked || step === "done";

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => (o || canClose) && setOpen(o)}>
      <DialogPrimitive.Trigger asChild>
        <Button variant={pendingCaptains || pendingMaps ? "outline" : "ghost"} size="sm">
          <Vote /> {pendingCaptains || pendingMaps ? "Votar" : "Alterar votos"}
        </Button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/75 data-[state=open]:animate-fade-in" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onEscapeKeyDown={(e) => !canClose && e.preventDefault()}
          onPointerDownOutside={(e) => !canClose && e.preventDefault()}
          className="fixed top-1/2 left-1/2 z-50 flex max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-border bg-surface shadow-2xl focus:outline-none data-[state=open]:animate-fade-in"
        >
          <div className="border-b border-border p-5 pb-4">
            <DialogPrimitive.Title className="font-display text-lg font-bold">Votações do mix</DialogPrimitive.Title>
            <ol className="mt-3 flex items-center gap-2 text-xs font-semibold tracking-wide uppercase">
              {(captainsLocked ? (["maps", "done"] as const) : (["captains", "maps", "done"] as const)).map((s, i) => (
                <li key={s} className={cn("flex items-center gap-2", step === s ? "text-brand" : "text-subtle")}>
                  {i > 0 && <span className="h-px w-4 bg-border" aria-hidden />}
                  {s === "captains" ? "Capitães" : s === "maps" ? "Mapas" : "Concluído"}
                </li>
              ))}
            </ol>
            {locked && step !== "done" && (
              <p className="mt-3 text-xs text-muted">
                Os 10 classificados estão definidos. Conclua suas votações para seguir para a seleção de equipes.
              </p>
            )}
            {canClose && (
              <DialogPrimitive.Close className="absolute top-3 right-3 rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-fg">
                <X className="size-4" />
                <span className="sr-only">Fechar</span>
              </DialogPrimitive.Close>
            )}
          </div>

          <div className="overflow-y-auto p-5">
            {step === "captains" && (
              <>
                <p className="mb-3 flex items-center gap-2 text-sm text-muted">
                  <Crown className="size-4 text-brand" /> Escolha até {CAPTAIN_VOTES_PER_PLAYER} capitães (
                  {captains.length}/{CAPTAIN_VOTES_PER_PLAYER})
                </p>
                <ul className="grid gap-1.5 sm:grid-cols-2">
                  {candidates.map((c) => {
                    const active = captains.includes(c.userId);
                    return (
                      <li key={c.userId}>
                        <button
                          type="button"
                          aria-pressed={active}
                          onClick={() => setCaptains((l) => toggle(l, c.userId, CAPTAIN_VOTES_PER_PLAYER))}
                          className={cn(
                            "flex w-full items-center gap-2.5 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                            active
                              ? "border-brand bg-brand/10"
                              : "border-border bg-surface-2 hover:border-border-strong",
                          )}
                        >
                          <Avatar name={c.displayName} src={c.avatarUrl} size="xs" />
                          <span className="flex-1 truncate font-medium">{c.displayName}</span>
                          {active && <Check className="size-4 text-brand" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}

            {step === "maps" && (
              <>
                <p className="mb-3 flex items-center gap-2 text-sm text-muted">
                  <MapIcon className="size-4 text-brand" /> Escolha exatamente {MAP_VOTES_PER_PLAYER} mapas (
                  {chosenMaps.length}/{MAP_VOTES_PER_PLAYER})
                </p>
                <ul className="grid grid-cols-2 gap-1.5">
                  {maps.map((m) => {
                    const active = chosenMaps.includes(m.id);
                    return (
                      <li key={m.id}>
                        <button
                          type="button"
                          aria-pressed={active}
                          onClick={() => setChosenMaps((l) => toggle(l, m.id, MAP_VOTES_PER_PLAYER))}
                          className={cn(
                            "flex h-10 w-full items-center justify-between rounded-md border px-3 text-sm font-medium transition-colors",
                            active
                              ? "border-brand bg-brand/10 text-fg"
                              : "border-border bg-surface-2 text-muted hover:border-border-strong hover:text-fg",
                          )}
                        >
                          {m.name}
                          {active && <Check className="size-4 text-brand" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}

            {step === "done" && (
              <div className="py-6 text-center">
                <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-win/15 text-win">
                  <Check className="size-5" />
                </div>
                <p className="font-medium">Votações concluídas!</p>
                <p className="mt-1 text-sm text-muted">
                  Você pode alterar seus votos até a seleção de equipes começar.
                </p>
              </div>
            )}
          </div>

          <div className="flex gap-2 border-t border-border p-4">
            {step === "done" ? (
              <>
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => setStep(captainsLocked ? "maps" : "captains")}
                >
                  Rever votos
                </Button>
                <Button variant="primary" className="flex-1" onClick={() => setOpen(false)}>
                  Fechar
                </Button>
              </>
            ) : (
              <>
                {step === "maps" && !captainsLocked && (
                  <Button variant="secondary" onClick={() => setStep("captains")} disabled={saving}>
                    Voltar
                  </Button>
                )}
                <Button
                  variant="primary"
                  className="flex-1"
                  disabled={
                    saving || (step === "captains" ? captains.length === 0 : chosenMaps.length !== MAP_VOTES_PER_PLAYER)
                  }
                  onClick={save}
                >
                  {saving && <Loader2 className="animate-spin" />}
                  {step === "captains" ? "Confirmar capitães" : "Confirmar mapas"}
                </Button>
                {step === "captains" && !pendingCaptains && (
                  <Button variant="ghost" onClick={() => setStep("maps")} disabled={saving}>
                    Pular
                  </Button>
                )}
              </>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
