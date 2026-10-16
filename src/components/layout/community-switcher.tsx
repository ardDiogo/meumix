import type { Community } from "@/types/domain";

/**
 * Indica a comunidade ativa. A troca entre comunidades será habilitada
 * quando o suporte a múltiplas comunidades estiver no backend.
 */
export function CommunityBadge({ community }: { community: Community }) {
  return (
    <div className="rounded-md border border-border bg-surface-2/60 px-3 py-2">
      <div className="text-[10px] font-semibold tracking-wider text-subtle uppercase">Comunidade</div>
      <div className="truncate text-sm font-medium text-fg">{community.name}</div>
    </div>
  );
}
