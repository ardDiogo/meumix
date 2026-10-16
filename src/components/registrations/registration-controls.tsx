"use client";

import { Loader2, LogIn, RotateCcw, Trash2, UserMinus, UserPlus } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";
import {
  joinMix,
  leaveMix,
  removeRegistration,
  resetRegistrations,
  type ActionResult,
} from "@/app/(app)/inscricoes/actions";
import type { RegistrationWindow } from "@/lib/mix-schedule";
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

export function JoinButton({
  scheduleId,
  date,
  loggedIn,
  registered,
  regWindow,
  opensLabel,
}: {
  scheduleId: string;
  date: string;
  loggedIn: boolean;
  registered: boolean;
  regWindow: RegistrationWindow;
  opensLabel: string;
}) {
  const [pending, run] = useAction();

  if (!loggedIn) {
    return (
      <Button variant="primary" size="lg" className="w-full" asChild>
        <Link href="/entrar?next=/dashboard">
          <LogIn /> Entre ou cadastre-se para participar
        </Link>
      </Button>
    );
  }
  if (registered) {
    return (
      <Button
        variant="secondary"
        size="lg"
        className="w-full"
        disabled={pending || regWindow === "closed"}
        onClick={() => run(() => leaveMix(scheduleId, date))}
      >
        {pending ? <Loader2 className="animate-spin" /> : <UserMinus />}
        {regWindow === "closed" ? "Inscrição confirmada" : "Cancelar minha inscrição"}
      </Button>
    );
  }
  if (regWindow !== "open") {
    return (
      <Button variant="secondary" size="lg" className="w-full" disabled>
        {regWindow === "not_open" ? `Inscrições abrem ${opensLabel}` : "Inscrições encerradas"}
      </Button>
    );
  }
  return (
    <Button
      variant="primary"
      size="lg"
      className="w-full"
      disabled={pending}
      onClick={() => run(() => joinMix(scheduleId, date))}
    >
      {pending ? <Loader2 className="animate-spin" /> : <UserPlus />}
      Quero participar
    </Button>
  );
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
