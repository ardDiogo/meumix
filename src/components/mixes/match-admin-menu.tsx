"use client";

import { CalendarDays, Loader2, MoreHorizontal, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteMatch } from "@/app/(app)/mixes/actions";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { EditMatchDate } from "./edit-match-date";

/** Admin: "⋯" no topo do mix finalizado (alterar a data e excluir). */
export function MatchAdminMenu({ matchId, date, label }: { matchId: string; date: string; label: string }) {
  const [dateOpen, setDateOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="px-2" aria-label="Mais ações do mix" title="Mais ações">
            {pending ? <Loader2 className="animate-spin" /> : <MoreHorizontal />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setDateOpen(true)}>
            <CalendarDays /> Alterar data
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-loss data-[highlighted]:bg-loss/15 [&_svg]:text-loss"
            onSelect={() =>
              confirm(
                `Excluir o ${label}? O resultado e as estatísticas somem e o ELO que essa partida deu ou tirou de cada jogador é desfeito. Não dá para desfazer.`,
              ) &&
              start(async () => {
                const r = await deleteMatch(matchId);
                if (r.ok) {
                  toast.success(r.message);
                  router.push("/mixes");
                } else toast.error(r.message);
              })
            }
          >
            <Trash2 /> Excluir mix
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <EditMatchDate matchId={matchId} date={date} open={dateOpen} onOpenChange={setDateOpen} />
    </>
  );
}
