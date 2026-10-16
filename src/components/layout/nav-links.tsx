"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_MAIN, NAV_SECONDARY, type NavItem } from "./nav-items";

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = isActive(pathname, item.href);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      title={item.description}
      className={cn(
        "relative flex h-9 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors",
        active ? "bg-surface-2 text-fg" : "text-muted hover:bg-surface-2/60 hover:text-fg",
      )}
    >
      {active && <span className="absolute inset-y-2 left-0 w-0.5 rounded-r bg-brand" aria-hidden />}
      <Icon className={cn("size-4 shrink-0", active && "text-brand")} aria-hidden />
      {item.label}
    </Link>
  );
}

export function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Navegação principal" className="flex flex-1 flex-col gap-6">
      <div className="flex flex-col gap-0.5">
        {NAV_MAIN.map((item) => (
          <NavLink key={item.href} item={item} onNavigate={onNavigate} />
        ))}
      </div>
      <div className="mt-auto flex flex-col gap-0.5 border-t border-border pt-3">
        {NAV_SECONDARY.map((item) => (
          <NavLink key={item.href} item={item} onNavigate={onNavigate} />
        ))}
      </div>
    </nav>
  );
}
