"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { recalcPtsFromGc } from "@/app/(app)/admin/actions";
import { Button } from "../ui/button";

/** Super admin: refaz a PTS dos mixes antigos com as mortes trocadas da GC (MVP e ELO juntos). */
export function RecalcPtsButton() {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        confirm(
          "Recalcular a PTS de todos os mixes da GC com as mortes trocadas? O MVP e o ELO das ligas são refeitos.",
        ) &&
        start(async () => {
          const r = await recalcPtsFromGc();
          if (r.ok) toast.success(r.message);
          else toast.error(r.message);
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Recalcular PTS com os trades da GC
    </Button>
  );
}
