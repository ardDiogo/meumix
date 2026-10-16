import { Search } from "lucide-react";
import Link from "next/link";
import type { Community } from "@/types/domain";
import { Logo } from "../brand/logo";
import { MobileNav } from "./mobile-nav";
import { PlayerSearch } from "./player-search";
import { UserMenu, type MenuUser } from "./user-menu";

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
    <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-border bg-bg/90 px-4 backdrop-blur lg:px-6">
      <MobileNav community={community} showAdmin={showAdmin} />
      <Logo className="lg:hidden" height={26} />
      <PlayerSearch className="ml-auto hidden w-full max-w-xs sm:block lg:ml-0" />
      <div className="ml-auto flex items-center gap-1 sm:ml-0 lg:ml-auto">
        <Link
          href="/jogadores"
          className="flex size-9 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-fg sm:hidden"
          aria-label="Buscar jogadores"
        >
          <Search className="size-4" />
        </Link>
        <UserMenu user={user} showAdmin={showAdmin} />
      </div>
    </header>
  );
}
