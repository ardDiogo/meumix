"use client";

import { Loader2, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setPaidPlayers } from "@/app/(app)/campeonatos/actions";
import { Button } from "../ui/button";
import { Input, Label } from "../ui/input";

/** Organização informa quantas inscrições foram pagas (o pagamento é feito fora do site). */
export function PaidForm({
  championshipId,
  paid,
  registered,
}: {
  championshipId: string;
  paid: number | null;
  registered: number;
}) {
  const router = useRouter();
  const [value, setValue] = useState(paid == null ? "" : String(paid));
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await setPaidPlayers(championshipId, value === "" ? null : Number(value));
          if (r.ok) toast.success(r.message);
          else toast.error(r.message);
          router.refresh();
        });
      }}
    >
      <div>
        <Label htmlFor="paid">Inscrições pagas</Label>
        <Input
          id="paid"
          type="number"
          min={0}
          max={1000}
          className="w-36"
          placeholder={`${registered} (inscritos)`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </div>
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <Save />} Salvar
      </Button>
      <p className="w-full text-xs text-subtle">Em branco, a premiação usa o número de inscritos.</p>
    </form>
  );
}
