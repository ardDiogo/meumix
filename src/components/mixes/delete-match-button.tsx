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
}: {
  matchId: string;
  label: string;
  redirectTo?: string;
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
      className="px-2 text-loss hover:text-loss"
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
