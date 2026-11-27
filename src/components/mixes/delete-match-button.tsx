"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { deleteMatch } from "@/app/(app)/mixes/actions";
import { Button } from "../ui/button";

export function DeleteMatchButton({
  matchId,
  label,
  redirectTo,
  subtle,
}: {
  matchId: string;
  label: string;
  redirectTo?: string;
  /** Cinza até passar o mouse (nas listas, para não chamar mais atenção que o mix). */
  subtle?: boolean;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label={`Excluir ${label}`}
      title="Excluir mix (desfaz o ELO)"
      disabled={pending}
      className={subtle ? "px-2 text-subtle hover:text-loss" : "px-2 text-loss hover:text-loss"}
      onClick={() =>
        confirm(
          `Excluir o ${label}? O resultado e as estatísticas somem e o ELO que essa partida deu ou tirou de cada jogador é desfeito. Não dá para desfazer.`,
        ) &&
        start(async () => {
          const r = await deleteMatch(matchId);
          if (r.ok) {
            toast.success(r.message);
            if (redirectTo) router.push(redirectTo);
          } else toast.error(r.message);
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : <Trash2 />}
    </Button>
  );
}
