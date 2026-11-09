"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_MAIN } from "./nav-items";

/** Menu principal horizontal (a partir de 1280px): aba ativa sublinhada em laranja. */
export function TopNav({ className }: { className?: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Navegação principal" className={cn("flex h-full items-stretch", className)}>
      {NAV_MAIN.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            title={item.description}
            className={cn(
              "relative flex items-center px-2.5 text-sm font-medium transition-colors",
              active ? "text-brand" : "text-muted hover:text-fg",
            )}
          >
            {item.label}
            {active && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-t bg-brand" aria-hidden />}
          </Link>
        );
      })}
    </nav>
  );
}
