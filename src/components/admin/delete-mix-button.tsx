"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { cancelMix } from "@/app/(app)/admin/config-actions";
import { Button } from "../ui/button";

export function DeleteMixButton({ scheduleId, date, label }: { scheduleId: string; date: string; label: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="danger"
      className="w-full"
      disabled={pending}
      onClick={() =>
        confirm(
          `Deletar o mix de ${label}? Inscrições, votos e times dessa data serão apagados e o mix sai da agenda nesse dia. A agenda recorrente continua nas próximas semanas.`,
        ) &&
        start(async () => {
          const r = await cancelMix(scheduleId, date);
          if (r.ok) toast.success(r.message);
          else toast.error(r.message);
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : <Trash2 />} Deletar mix
    </Button>
  );
}
