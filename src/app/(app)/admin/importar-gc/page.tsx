import { Download, LockKeyhole } from "lucide-react";
import type { Metadata } from "next";
import { GcReceiver } from "@/components/admin/gc-receiver";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { getPermissions } from "@/services/auth";
import { isChampionshipOrganizer } from "@/services/championships";

export const metadata: Metadata = { title: "Importar da GC" };

/** Destino do botão "Enviar ao MeuMix": guarda o mapa na fila da finalização. */
export default async function ImportGcPage() {
  const { canManageMixes, session } = await getPermissions();
  // Admins (mix) e quem organiza algum campeonato (importa os jogos do campeonato).
  if (!canManageMixes && !(await isChampionshipOrganizer(session))) {
    return (
      <Card>
        <EmptyState
          icon={LockKeyhole}
          title="Acesso restrito a administradores e organizadores"
          description="Entre com a conta de admin (ou de organizador do campeonato) neste navegador e clique no botão da GC de novo."
        />
      </Card>
    );
  }
  return (
    <>
      <PageHeader
        title="Importar da GC"
        description="Mapas enviados pelo botão da GC. Eles ficam guardados neste navegador até você usar na finalização do mix ou no jogo do campeonato."
        actions={<Download className="size-5 text-brand" />}
      />
      <Card>
        <CardContent className="pt-5">
          <GcReceiver />
        </CardContent>
      </Card>
    </>
  );
}
