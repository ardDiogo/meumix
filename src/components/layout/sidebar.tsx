import type { Community } from "@/types/domain";
import { Logo } from "../brand/logo";
import { CommunityBadge } from "./community-switcher";
import { NavLinks } from "./nav-links";

export function Sidebar({ community }: { community: Community }) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-5 border-r border-border bg-surface px-3 py-4 lg:flex">
      <div className="px-2">
        <Logo />
      </div>
      <CommunityBadge community={community} />
      <NavLinks />
    </aside>
  );
}
