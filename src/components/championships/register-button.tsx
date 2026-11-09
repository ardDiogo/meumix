"use client";

import { CheckCircle2, DoorOpen, Loader2, UserPlus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { openRegistrations, registerSelf, unregisterSelf } from "@/app/(app)/campeonatos/register-actions";
import { Button } from "../ui/button";

/** Inscrever-se no campeonato (draft) ou cancelar a própria inscrição. */
export function RegisterButton({
  championshipId,
  registered,
  full,
}: {
  championshipId: string;
  registered: boolean;
  full: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; message: string }>) =>
    start(async () => {
      const r = await fn();
      if (r.ok) toast.success(r.message);
      else toast.error(r.message);
      router.refresh();
    });

  if (registered) {
    return (
      <>
        <span className="flex items-center gap-1.5 text-sm font-semibold text-win">
          <CheckCircle2 className="size-4" /> Você está inscrito
        </span>
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => confirm("Cancelar sua inscrição no campeonato?") && run(() => unregisterSelf(championshipId))}
        >
          {pending ? <Loader2 className="animate-spin" /> : <X />} Cancelar inscrição
        </Button>
      </>
    );
  }
  return (
    <Button variant="primary" disabled={pending || full} onClick={() => run(() => registerSelf(championshipId))}>
      {pending ? <Loader2 className="animate-spin" /> : <UserPlus />} {full ? "Vagas preenchidas" : "Inscrever-se"}
    </Button>
  );
}

/** Organização: abre as inscrições do campeonato em configuração. */
export function OpenRegistrationsButton({ championshipId }: { championshipId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="primary"
      disabled={pending}
      onClick={() =>
        confirm("Abrir as inscrições? O status passa para “Aguardando inscrições”.") &&
        start(async () => {
          const r = await openRegistrations(championshipId);
          if (r.ok) toast.success(r.message);
          else toast.error(r.message);
          router.refresh();
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : <DoorOpen />} Abrir inscrições
    </Button>
  );
}
