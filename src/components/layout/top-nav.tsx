"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_MAIN } from "./nav-items";

/** Menu principal horizontal (telas grandes): aba ativa sublinhada em laranja. */
export function TopNav({ className }: { className?: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Navegação principal" className={cn("flex h-full items-stretch", className)}>
      {NAV_MAIN.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            title={item.description}
            className={cn(
              "relative flex items-center gap-2 px-3 text-sm font-medium transition-colors xl:px-4",
              active ? "text-brand" : "text-muted hover:text-fg",
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            {item.label}
            {active && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-t bg-brand" aria-hidden />}
          </Link>
        );
      })}
    </nav>
  );
}
