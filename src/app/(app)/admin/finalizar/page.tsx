import { ArrowLeft, LockKeyhole } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { FinalizeSection } from "@/components/admin/finalize-section";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { getPermissions } from "@/services/auth";

export const metadata: Metadata = { title: "Finalizar mix" };
// A leitura dos prints por IA pode levar alguns segundos por imagem.
export const maxDuration = 60;

export default async function FinalizePage({ searchParams }: PageProps<"/admin/finalizar">) {
  const { canManageMixes } = await getPermissions();
  if (!canManageMixes) {
    return (
      <Card>
        <EmptyState icon={LockKeyhole} title="Acesso restrito a administradores" />
      </Card>
    );
  }

  const { agenda, data } = await searchParams;
  const valid = typeof agenda === "string" && typeof data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(data);
  const [y, m, d] = valid ? data.split("-") : [];

  return (
    <>
      <Button variant="ghost" size="sm" className="mb-3 -ml-2" asChild>
        <Link href="/admin">
          <ArrowLeft /> Painel administrativo
        </Link>
      </Button>
      {valid && (
        <PageHeader
          title="Finalizar mix"
          description={`Mix de ${d}/${m}/${y}. Confira os times, informe o placar e as estatísticas de cada jogador.`}
        />
      )}
      {valid ? (
        <FinalizeSection scheduleId={agenda} date={data} />
      ) : (
        <Card>
          <EmptyState
            icon={LockKeyhole}
            title="Mix não encontrado"
            description="Volte ao painel e escolha um mix para finalizar."
          />
        </Card>
      )}
    </>
  );
}
