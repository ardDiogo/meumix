"use client";

import { BellRing, Loader2 } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { sendTestPush } from "@/app/(app)/admin/actions";
import { Button } from "../ui/button";

/** Manda um aviso de teste para os aparelhos de quem clicou. */
export function PushTestButton() {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await sendTestPush();
          if (r.ok) toast.success(r.message);
          else toast.error(r.message);
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : <BellRing />} Enviar aviso de teste
    </Button>
  );
}
