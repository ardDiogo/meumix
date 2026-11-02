import { Download, LockKeyhole } from "lucide-react";
import type { Metadata } from "next";
import { GcReceiver } from "@/components/admin/gc-receiver";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { getPermissions } from "@/services/auth";

export const metadata: Metadata = { title: "Importar da GC" };

/** Destino do botão "Enviar ao MeuMix": guarda o mapa na fila da finalização. */
export default async function ImportGcPage() {
  const { canManageMixes } = await getPermissions();
  if (!canManageMixes) {
    return (
      <Card>
        <EmptyState
          icon={LockKeyhole}
          title="Acesso restrito a administradores"
          description="Entre com a conta de admin neste navegador e clique no botão da GC de novo."
        />
      </Card>
    );
  }
  return (
    <>
      <PageHeader
        title="Importar da GC"
        description="Mapas enviados pelo botão da GC. Eles ficam guardados neste navegador até você finalizar o mix."
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
