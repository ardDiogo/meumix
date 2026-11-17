"use client";

import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { registerSelf } from "@/app/(app)/campeonatos/register-actions";
import { Button } from "../ui/button";

/** Link de inscrição em 1 toque: inscreve sozinho ao abrir (uma vez por visita). */
export function AutoRegister({ championshipId, slug }: { championshipId: string; slug: string }) {
  const router = useRouter();
  const started = useRef(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    registerSelf(championshipId)
      .then((r) => {
        setResult(r);
        router.refresh();
      })
      .catch(() => setResult({ ok: false, message: "Falha de conexão. Recarregue a página para tentar de novo." }));
  }, [championshipId, router]);

  if (!result)
    return (
      <p className="flex items-center gap-2 text-sm font-medium">
        <Loader2 className="size-4 animate-spin" /> Fazendo a sua inscrição…
      </p>
    );
  return (
    <div className="flex flex-wrap items-center gap-3">
      <p className={`flex items-center gap-2 text-sm font-semibold ${result.ok ? "text-win" : "text-loss"}`}>
        {result.ok ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />} {result.message}
      </p>
      <Button variant="secondary" size="sm" asChild>
        <Link href={`/campeonatos/${slug}`}>Ver campeonato</Link>
      </Button>
    </div>
  );
}
