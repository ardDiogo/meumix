import { Crosshair } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4">
      <Logo height={44} />
      <EmptyState
        icon={Crosshair}
        title="Página não encontrada"
        description="O conteúdo que você procura não existe ou foi removido."
        action={
          <Button variant="primary" asChild>
            <Link href="/dashboard">Voltar ao dashboard</Link>
          </Button>
        }
      />
    </div>
  );
}
