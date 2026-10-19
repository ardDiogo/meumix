import Link from "next/link";
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
import { LEGAL } from "@/lib/legal";
import { InstallBanner, InstallLink } from "@/components/pwa/pwa";

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
        <footer className="border-t border-border">
          <nav className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-4 text-xs text-subtle lg:px-6">
            <span>MeuMix</span>
            <Link href="/privacidade" className="hover:text-fg">
              Privacidade
            </Link>
            <Link href="/termos" className="hover:text-fg">
              Termos
            </Link>
            <Link href="/cookies" className="hover:text-fg">
              Cookies
            </Link>
            <a href={`mailto:${LEGAL.contactEmail}`} className="hover:text-fg">
              {LEGAL.contactEmail}
            </a>
            <InstallLink className="text-brand hover:text-brand-hover" />
          </nav>
        </footer>
      </div>
      <InstallBanner />
      <MusicSettingsWatcher snapshot={JSON.stringify({ features, musicUrl })} />
      {features.background_music && musicUrl && <BackgroundMusic url={musicUrl} />}
    </LevelsProvider>
  );
}
