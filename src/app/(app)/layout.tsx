import { DemoBanner } from "@/components/demo-notice";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { getDataSource } from "@/services";
import { getPermissions } from "@/services/auth";
import { profileAvatars } from "@/services/avatars";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ds = getDataSource();
  const [community, { session, canManageMixes }] = await Promise.all([ds.getCommunity(), getPermissions()]);
  const avatarUrl = session ? ((await profileAvatars([session.id])).get(session.id)?.avatarUrl ?? null) : null;
  const user = session && {
    displayName: session.displayName,
    avatarUrl,
    email: session.email,
    roleLabel: session.isSuperAdmin ? "Super admin" : session.role === "admin" ? "Administrador" : null,
  };

  return (
    <div className="flex min-h-dvh">
      <Sidebar community={community} showAdmin={canManageMixes} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar community={community} user={user} showAdmin={canManageMixes} />
        <DemoBanner kind={ds.kind} />
        <main id="conteudo" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 lg:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}
