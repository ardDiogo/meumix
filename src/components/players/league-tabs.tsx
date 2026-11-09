import Link from "next/link";
import type { League } from "@/lib/league";
import { cn } from "@/lib/utils";

/** Abas do perfil: uma por liga em que o jogador joga e, com mais de uma, "Geral". */
export function LeagueTabs({
  tabs,
  active,
  basePath,
  compare,
}: {
  tabs: League[];
  active: string | null;
  basePath: string;
  compare: string | null;
}) {
  const items = [
    ...tabs.map((l) => ({ slug: l.slug, label: l.name })),
    ...(tabs.length > 1 ? [{ slug: "geral", label: "Geral" }] : []),
  ];
  const href = (slug: string) => {
    const q = new URLSearchParams({ liga: slug });
    if (compare) q.set("comparar", compare);
    return `${basePath}?${q}`;
  };
  return (
    <nav
      aria-label="Ligas do jogador"
      className="mb-4 flex gap-1 overflow-x-auto rounded-lg border border-border bg-surface p-1"
    >
      {items.map((t) => (
        <Link
          key={t.slug}
          href={href(t.slug)}
          scroll={false}
          aria-current={t.slug === active ? "page" : undefined}
          className={cn(
            "shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            t.slug === active ? "bg-brand text-brand-fg" : "text-muted hover:bg-surface-2 hover:text-fg",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
