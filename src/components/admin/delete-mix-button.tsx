"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { cancelMix } from "@/app/(app)/admin/config-actions";
import { Button } from "../ui/button";

export function DeleteMixButton({
  scheduleId,
  date,
  label,
  compact,
  text,
  redirectTo,
}: {
  scheduleId: string;
  date: string;
  label: string;
  /** Versão pequena (lista de mixes para finalizar). */
  compact?: boolean;
  /** Texto do botão (padrão: "Descartar" no compacto, "Deletar mix" no normal). */
  text?: string;
  /** Página para onde ir depois de excluir. */
  redirectTo?: string;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Button
      variant={compact ? "ghost" : "danger"}
      size={compact ? "sm" : undefined}
      className={compact ? "text-loss hover:text-loss" : "w-full"}
      disabled={pending}
      onClick={() =>
        confirm(
          `Deletar o mix de ${label}? Inscrições, votos e times dessa data serão apagados e o mix sai da agenda nesse dia. A agenda recorrente continua nas próximas semanas.`,
        ) &&
        start(async () => {
          const r = await cancelMix(scheduleId, date);
          if (r.ok) {
            toast.success(r.message);
            if (redirectTo) router.push(redirectTo);
          } else toast.error(r.message);
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : <Trash2 />} {text ?? (compact ? "Descartar" : "Deletar mix")}
    </Button>
  );
}
