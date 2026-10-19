import "server-only";
import { mapName } from "@/lib/maps";
import { formSeries, mapRecords } from "@/lib/player-form";
import { playerResult } from "@/lib/stats";
import type { PickInfo } from "@/lib/pick-types";
import { byPriority, playerBadges } from "./badges";
import { getDataSource } from "@/services";
import { getRanking } from "./queries";

/**
 * Carrega tudo de uma vez para os jogadores do PICK: ranking geral (mesma
 * regra da página Rankings), mixes, mapas e insígnias ativas — sem uma consulta
 * por jogador.
 */
export async function getPickInfo(userIds: string[]): Promise<Record<string, PickInfo>> {
  if (!userIds.length) return {};
  const [ranking, monthly, badges] = await Promise.all([
    getRanking({ period: "all" }),
    getRanking({ period: "30d" }),
    playerBadges(userIds),
  ]);
  const mixes = await getDataSource().listMixes({ status: "finished" });

  const out: Record<string, PickInfo> = {};
  for (const id of userIds) {
    const row = ranking.rows.find((r) => r.player.id === id);
    const mine = mixes.filter((m) => playerResult(m, id) !== null);
    const form = formSeries(mine, id);
    const lastRatings = form
      .slice(-5)
      .map((p) => p.rating)
      .filter((x): x is number => x != null);
    out[id] = {
      elo: row?.elo ?? 0,
      position: row?.position ?? null,
      ranked: ranking.total,
      mixes: row?.stats.mixes ?? 0,
      winRate: row?.stats.winRate ?? 0,
      eloChange30d: monthly.rows.find((r) => r.player.id === id)?.eloChange ?? 0,
      recent: mine
        .slice(0, 5)
        .map((m) => playerResult(m, id)!)
        .filter(Boolean),
      rating: lastRatings.length
        ? Math.round((lastRatings.reduce((s, x) => s + x, 0) / lastRatings.length) * 100) / 100
        : null,
      bestMaps: mapRecords(mine, id)
        .filter((m) => m.played >= 3)
        .sort((a, b) => b.winRate - a.winRate || b.played - a.played)
        .slice(0, 2)
        .map((m) => ({ mapId: m.mapId, name: mapName(m.mapId), winRate: m.winRate, played: m.played })),
      badges: byPriority(badges.filter((b) => b.userId === id)).map((b) => ({
        id: b.id,
        name: b.name,
        icon: b.icon,
        color: b.color,
        description: b.description,
        unlock: b.unlock,
        reason: b.reason,
        kind: b.kind,
        since: b.createdAt,
      })),
    };
  }
  return out;
}
