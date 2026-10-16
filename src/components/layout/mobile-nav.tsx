"use client";

import { Menu } from "lucide-react";
import { useState } from "react";
import type { Community } from "@/types/domain";
import { Logo } from "../brand/logo";
import { Button } from "../ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "../ui/sheet";
import { CommunityBadge } from "./community-switcher";
import { NavLinks } from "./nav-links";

export function MobileNav({ community }: { community: Community }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Abrir menu">
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent aria-describedby={undefined} className="gap-5 px-3 py-4">
        <SheetTitle className="px-2">
          <Logo />
        </SheetTitle>
        <CommunityBadge community={community} />
        <NavLinks onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
