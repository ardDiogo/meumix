"use client";

import { CalendarDays, Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateMatchDate } from "@/app/(app)/mixes/actions";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogTrigger } from "../ui/dialog";
import { Input, Label } from "../ui/input";

/** Admin: corrige a data de um mix finalizado. */
export function EditMatchDate({ matchId, date }: { matchId: string; date: string }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(date);
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="px-2" aria-label="Alterar data do mix" title="Alterar data do mix">
          <CalendarDays />
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Alterar data do mix"
        description="Use se o mix foi finalizado com a data errada. ELO e estatísticas não mudam."
      >
        <Label htmlFor="match-date">Data em que o mix foi jogado</Label>
        <Input id="match-date" type="date" value={value} onChange={(e) => setValue(e.target.value)} />
        <div className="mt-5 flex justify-end">
          <Button
            variant="primary"
            disabled={pending || !value || value === date}
            onClick={() =>
              start(async () => {
                const r = await updateMatchDate(matchId, value);
                if (r.ok) {
                  toast.success(r.message);
                  setOpen(false);
                } else toast.error(r.message);
              })
            }
          >
            {pending && <Loader2 className="animate-spin" />} Salvar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
