"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Card>
      <EmptyState
        icon={AlertTriangle}
        title="Algo deu errado ao carregar esta página"
        description={
          <>
            Tente novamente. Se o problema persistir, informe o código{" "}
            <code className="text-fg">{error.digest ?? "desconhecido"}</code>.
          </>
        }
        action={
          <Button variant="primary" onClick={reset}>
            <RotateCcw /> Tentar novamente
          </Button>
        }
      />
    </Card>
  );
}
