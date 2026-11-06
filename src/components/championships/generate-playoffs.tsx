"use client";

import { GitBranch, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { generatePlayoffs } from "@/app/(app)/campeonatos/playoffs-actions";
import { Button } from "../ui/button";

/** Gera (ou refaz, sem resultados) a chave dos playoffs pela classificação. */
export function GeneratePlayoffs({ championshipId, again }: { championshipId: string; again: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant={again ? "ghost" : "primary"}
      size="sm"
      disabled={pending}
      onClick={() => {
        if (again && !confirm("Refazer a chave pela classificação atual? Datas já combinadas dos playoffs se perdem."))
          return;
        start(async () => {
          const r = await generatePlayoffs(championshipId);
          if (r.ok) toast.success(r.message);
          else toast.error(r.message);
          router.refresh();
        });
      }}
    >
      {pending ? <Loader2 className="animate-spin" /> : <GitBranch />} {again ? "Refazer chave" : "Gerar playoffs"}
    </Button>
  );
}
