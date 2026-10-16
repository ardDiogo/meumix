import Link from "next/link";
import { cn } from "@/lib/utils";

/** Filtros segmentados baseados em links (mantêm o estado na URL). */
export function FilterTabs({
  options,
  current,
  label,
  className,
}: {
  options: { value: string; label: string; href: string; count?: number }[];
  current: string;
  label: string;
  className?: string;
}) {
  return (
    <nav
      aria-label={label}
      className={cn(
        "inline-flex max-w-full overflow-x-auto rounded-md border border-border bg-surface p-0.5",
        className,
      )}
    >
      {options.map((o) => {
        const active = o.value === current;
        return (
          <Link
            key={o.value}
            href={o.href}
            scroll={false}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-[5px] px-3 text-sm font-medium whitespace-nowrap transition-colors",
              active ? "bg-surface-3 text-fg" : "text-muted hover:text-fg",
            )}
          >
            {o.label}
            {o.count != null && (
              <span className={cn("text-xs tabular", active ? "text-brand" : "text-subtle")}>{o.count}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
