"use client";

import { Loader2, RotateCcw, Trash2 } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { removeRegistration, resetRegistrations, type ActionResult } from "@/app/(app)/inscricoes/actions";
import { Button } from "../ui/button";

function useAction() {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionResult>) =>
    start(async () => {
      const r = await fn();
      if (r.ok) toast.success(r.message);
      else toast.error(r.message);
    });
  return [pending, run] as const;
}

export function ResetButton({ scheduleId, date }: { scheduleId: string; date: string }) {
  const [pending, run] = useAction();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-loss hover:text-loss"
      disabled={pending}
      onClick={() => {
        if (confirm("Remover TODAS as inscrições deste mix?")) run(() => resetRegistrations(scheduleId, date));
      }}
    >
      {pending ? <Loader2 className="animate-spin" /> : <RotateCcw />} Reiniciar
    </Button>
  );
}

export function RemoveButton({ registrationId, name }: { registrationId: string; name: string }) {
  const [pending, run] = useAction();
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-8 text-muted hover:text-loss"
      disabled={pending}
      aria-label={`Remover ${name}`}
      onClick={() => {
        if (confirm(`Remover ${name} da lista?`)) run(() => removeRegistration(registrationId));
      }}
    >
      {pending ? <Loader2 className="animate-spin" /> : <Trash2 />}
    </Button>
  );
}
