import "server-only";
import type { DataSource, ListMixesOptions } from "@/services/data-source";
import { DEMO_CURRENT_PLAYER_ID, DEMO_NOW, generateDemoDataset, type DemoDataset } from "./generate";

let dataset: DemoDataset | null = null;
const data = () => (dataset ??= generateDemoDataset());

/** Fonte de dados em memória com dados fictícios. Somente leitura. */
export const demoDataSource: DataSource = {
  kind: "demo",
  now: () => DEMO_NOW,

  async getCommunity() {
    return data().community;
  },
  async getCurrentPlayerId() {
    return DEMO_CURRENT_PLAYER_ID;
  },
  async listPlayers() {
    return data().players;
  },
  async getPlayer(id) {
    return data().players.find((p) => p.id === id) ?? null;
  },
  async getElos() {
    return new Map(data().elos);
  },
  async listMixes({ playerId, status, limit }: ListMixesOptions = {}) {
    const statuses = status == null ? null : Array.isArray(status) ? status : [status];
    const result = data().mixes.filter(
      (m) =>
        (!statuses || statuses.includes(m.status)) &&
        (!playerId || m.teams.some((t) => t.playerIds.includes(playerId))),
    );
    return limit ? result.slice(0, limit) : result;
  },
  async getMix(id) {
    return data().mixes.find((m) => m.id === id) ?? null;
  },
  async getEloHistory(playerId) {
    return data().eloHistory.filter((e) => !playerId || e.playerId === playerId);
  },
  async listHighlights() {
    return data().highlights;
  },
};
