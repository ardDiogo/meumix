"use client";

import { ImageDown, Loader2 } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { fillClips } from "@/app/(app)/clipes/actions";
import { Button } from "../ui/button";

/** Admin: busca as miniaturas que faltam e corrige o tipo pelo título. */
export function FillClipsButton({ count }: { count: number }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="secondary"
      disabled={pending}
      title="Busca as miniaturas que faltam e corrige o tipo (Ace, Clutch, Multikill) pelo título"
      onClick={() =>
        start(async () => {
          const r = await fillClips();
          if (r.ok) toast.success(r.message);
          else toast.error(r.message);
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : <ImageDown />} Completar {count} clipe{count === 1 ? "" : "s"}
    </Button>
  );
}
