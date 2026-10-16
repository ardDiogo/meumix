import { Search } from "lucide-react";
import Link from "next/link";
import type { Community } from "@/types/domain";
import { Logo } from "../brand/logo";
import { MobileNav } from "./mobile-nav";
import { PlayerSearch } from "./player-search";
import { TopNav } from "./top-nav";
import { UserMenu, type MenuUser } from "./user-menu";

/** Menu superior: logo, navegação, busca e conta. No celular, o menu vira ☰. */
export function Topbar({
  community,
  user,
  showAdmin,
}: {
  community: Community;
  user: MenuUser | null;
  showAdmin: boolean;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 lg:gap-6 lg:px-6">
        <MobileNav community={community} showAdmin={showAdmin} />
        <Logo height={30} className="shrink-0" />
        <TopNav className="hidden lg:flex" />
        <div className="ml-auto flex items-center gap-2">
          <PlayerSearch className="hidden w-56 xl:block" />
          <Link
            href="/jogadores"
            className="flex size-9 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-fg xl:hidden"
            aria-label="Buscar jogadores"
          >
            <Search className="size-4" />
          </Link>
          <UserMenu user={user} showAdmin={showAdmin} />
        </div>
      </div>
    </header>
  );
}
