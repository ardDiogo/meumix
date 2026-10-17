import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { exportAccountData } from "@/services/account";
import { audit } from "@/services/audit";
import { getSession } from "@/services/auth";

export const dynamic = "force-dynamic";

/** Baixar meus dados: JSON só com os dados do titular logado. */
export async function GET() {
  const session = await getSession();
  if (!session) return new Response("Entre na sua conta para baixar seus dados.", { status: 401 });
  const admin = createSupabaseAdminClient();
  if (!admin) return new Response("Servidor não configurado.", { status: 503 });

  const data = await exportAccountData(admin, session.id);
  await audit({ action: "account.export", outcome: "success", actorId: session.id });
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="meumix-meus-dados-${new Date().toISOString().slice(0, 10)}.json"`,
      "cache-control": "no-store",
    },
  });
}
