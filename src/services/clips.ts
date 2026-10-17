import "server-only";
import type { ClipView } from "@/components/clips/clip-card";
import { playerHref } from "@/lib/player-slug";
import type { Highlight, Mix, Player } from "@/types/domain";

/** Converte os clipes para os cartões, com links e permissão de excluir. */
export function toClipViews(
  highlights: Highlight[],
  ctx: {
    players: Map<string, Player>;
    mixes: Map<string, Pick<Mix, "id" | "name">>;
    viewerId: string | null;
    canManage: boolean;
  },
): ClipView[] {
  return highlights.map((h) => {
    const player = h.playerId ? ctx.players.get(h.playerId) : undefined;
    const mix = h.mixId ? ctx.mixes.get(h.mixId) : undefined;
    return {
      id: h.id,
      kind: h.kind,
      title: h.title,
      url: h.url,
      embedUrl: h.embedUrl ?? null,
      createdAt: h.createdAt,
      player: player ? { name: player.nickname, href: playerHref(player) } : null,
      mix: mix ? { name: mix.name, href: `/mixes/${mix.id}` } : null,
      canDelete:
        !!ctx.viewerId && (ctx.canManage || h.playerId === ctx.viewerId || (h.createdBy ?? null) === ctx.viewerId),
    };
  });
}
