import "server-only";
import type { ClipView } from "@/components/clips/clip-card";
import { playerHref } from "@/lib/player-slug";
import type { Highlight, Mix, Player } from "@/types/domain";
import { mixHref } from "@/lib/mix-slug";
import { clipMeta, effectiveKind } from "@/lib/clip-meta";

/** Converte os clipes para os cartões, com links e permissão de excluir. */
export function toClipViews(
  highlights: Highlight[],
  ctx: {
    players: Map<string, Player>;
    mixes: Map<string, Pick<Mix, "id" | "name" | "scheduledAt"> & Partial<Pick<Mix, "maps">>>;
    viewerId: string | null;
    canManage: boolean;
  },
): ClipView[] {
  return highlights.map((h) => {
    const player = h.playerId ? ctx.players.get(h.playerId) : undefined;
    const mix = h.mixId ? ctx.mixes.get(h.mixId) : undefined;
    const meta = clipMeta(h.title);
    // Sem mapa no título: o do mix, se ele teve um mapa só.
    const mapId = meta.mapId ?? (mix?.maps?.length === 1 ? mix.maps[0]!.mapId : null);
    return {
      id: h.id,
      kind: effectiveKind(h.kind, h.title),
      meta: { ...meta, mapId },
      playerId: h.playerId ?? null,
      title: h.title,
      url: h.url,
      embedUrl: h.embedUrl ?? null,
      source: h.source ?? "allstar",
      videoUrl: h.videoUrl ?? null,
      thumbnailUrl: h.thumbnailUrl ?? null,
      createdAt: h.createdAt,
      player: player ? { name: player.nickname, href: playerHref(player) } : null,
      mix: mix ? { id: mix.id, name: mix.name, href: mixHref(mix), date: mix.scheduledAt } : null,
      canDelete:
        !!ctx.viewerId && (ctx.canManage || h.playerId === ctx.viewerId || (h.createdBy ?? null) === ctx.viewerId),
    };
  });
}
