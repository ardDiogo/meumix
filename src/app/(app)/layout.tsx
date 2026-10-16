import { DemoBanner } from "@/components/demo-notice";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { getDataSource } from "@/services";
import { getPermissions } from "@/services/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ds = getDataSource();
  const [community, playerId, { canManageMixes }] = await Promise.all([
    ds.getCommunity(),
    ds.getCurrentPlayerId(),
    getPermissions(),
  ]);
  const player = playerId ? await ds.getPlayer(playerId) : null;

  return (
    <div className="flex min-h-dvh">
      <Sidebar community={community} showAdmin={canManageMixes} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar community={community} player={player} isDemo={ds.kind === "demo"} showAdmin={canManageMixes} />
        <DemoBanner kind={ds.kind} />
        <main id="conteudo" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 lg:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}
