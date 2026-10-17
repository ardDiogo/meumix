import { DemoBanner } from "@/components/demo-notice";
import { Topbar } from "@/components/layout/topbar";
import { getDataSource } from "@/services";
import { getPermissions } from "@/services/auth";
import { profileAvatars } from "@/services/avatars";
import { getLevels } from "@/services/levels";
import { LevelsProvider } from "@/components/players/levels-context";
import { BackgroundMusic, MusicSettingsWatcher } from "@/components/layout/background-music";
import { getFeatures } from "@/services/features";
import { getAppSetting } from "@/services/settings";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ds = getDataSource();
  const [community, { session, canManageMixes }, levels, features, musicUrl] = await Promise.all([
    ds.getCommunity(),
    getPermissions(),
    getLevels(),
    getFeatures(),
    getAppSetting("music_url"),
  ]);
  const avatarUrl = session ? ((await profileAvatars([session.id])).get(session.id)?.avatarUrl ?? null) : null;
  const user = session && {
    displayName: session.displayName,
    avatarUrl,
    email: session.email,
    roleLabel: session.isSuperAdmin ? "Super admin" : session.role === "admin" ? "Administrador" : null,
  };

  return (
    <LevelsProvider levels={levels}>
      <div className="flex min-h-dvh flex-col">
        <Topbar community={community} user={user} showAdmin={canManageMixes} />
        <DemoBanner kind={ds.kind} />
        <main id="conteudo" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 lg:px-6">
          {children}
        </main>
      </div>
      <MusicSettingsWatcher snapshot={JSON.stringify({ features, musicUrl })} />
      {features.background_music && musicUrl && <BackgroundMusic url={musicUrl} />}
    </LevelsProvider>
  );
}
