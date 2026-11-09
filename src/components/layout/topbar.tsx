import { Search } from "lucide-react";
import Link from "next/link";
import type { League } from "@/lib/league";
import { Logo } from "../brand/logo";
import { RefreshButton } from "../pwa/app-refresh";
import { LeagueSwitcher } from "./community-switcher";
import { MobileNav } from "./mobile-nav";
import { TopNav } from "./top-nav";
import { UserMenu, type MenuUser } from "./user-menu";

/** Menu superior: logo, navegação, busca e conta. No celular, o menu vira ☰. */
export function Topbar({
  leagues,
  league,
  user,
  showAdmin,
}: {
  leagues: League[];
  league: League | null;
  user: MenuUser | null;
  showAdmin: boolean;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 lg:px-6 xl:gap-5">
        <MobileNav leagues={leagues} league={league} showAdmin={showAdmin} />
        <Logo height={30} className="shrink-0" />
        <LeagueSwitcher leagues={leagues} current={league} className="hidden shrink-0 sm:flex" />
        <TopNav className="hidden xl:flex" />
        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/jogadores"
            className="flex size-9 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-fg"
            aria-label="Buscar jogadores"
          >
            <Search className="size-4" />
          </Link>
          <RefreshButton />
          <UserMenu user={user} showAdmin={showAdmin} />
        </div>
      </div>
    </header>
  );
}
