"use client";

import { CalendarClock, Loader2, X } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { deactivateSchedule } from "@/app/(app)/admin/actions";
import { describeRecurrence } from "@/lib/mix-schedule";
import type { Schedule } from "@/services/mix-events";
import { Button } from "../ui/button";
import { EmptyState } from "../ui/empty-state";

export function ScheduleList({ schedules }: { schedules: Schedule[] }) {
  if (!schedules.length) return <EmptyState icon={CalendarClock} title="Nenhum mix ativo" className="py-8" />;
  return (
    <ul className="divide-y divide-border">
      {schedules.map((s) => (
        <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <div className="font-medium">{describeRecurrence(s.recurrence)}</div>
            <div className="text-xs text-muted">
              Mix às <span className="text-fg tabular">{s.eventTime}</span> · inscrições às{" "}
              <span className="text-fg tabular">{s.registrationOpensAt}</span> · {s.maxPlayers} vagas
            </div>
          </div>
          <DeactivateButton id={s.id} />
        </li>
      ))}
    </ul>
  );
}

function DeactivateButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => {
        if (!confirm("Encerrar este mix? Ele deixa de aceitar inscrições.")) return;
        start(async () => {
          const r = await deactivateSchedule(id);
          if (r.ok) toast.success(r.message);
          else toast.error(r.message);
        });
      }}
    >
      {pending ? <Loader2 className="animate-spin" /> : <X />} Encerrar
    </Button>
  );
}
