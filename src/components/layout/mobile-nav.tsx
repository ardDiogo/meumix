"use client";

import { Menu } from "lucide-react";
import { useState } from "react";
import type { League } from "@/lib/league";
import { Logo } from "../brand/logo";
import { Button } from "../ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "../ui/sheet";
import { LeagueSwitcher } from "./community-switcher";
import { NavLinks } from "./nav-links";

export function MobileNav({
  leagues,
  league,
  showAdmin,
}: {
  leagues: League[];
  league: League | null;
  showAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="xl:hidden" aria-label="Abrir menu">
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent aria-describedby={undefined} className="gap-5 px-3 py-4">
        <SheetTitle className="px-2">
          <Logo />
        </SheetTitle>
        <LeagueSwitcher leagues={leagues} current={league} block />
        <NavLinks onNavigate={() => setOpen(false)} showAdmin={showAdmin} />
      </SheetContent>
    </Sheet>
  );
}
