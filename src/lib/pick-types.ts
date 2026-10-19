import type { MapId } from "@/types/domain";

export interface PickBadge {
  id: string;
  name: string;
  icon: string;
  color: string;
  description: string | null;
  unlock: string | null;
  reason: string | null;
  kind: "dynamic" | "permanent";
  since: string;
}

/** Resumo de um jogador para os capitães decidirem no PICK (só dados que o site já tem). */
export interface PickInfo {
  elo: number;
  position: number | null;
  ranked: number;
  mixes: number;
  winRate: number;
  eloChange30d: number;
  /** Mixes mais recentes primeiro. */
  recent: ("win" | "loss" | "draw")[];
  rating: number | null;
  bestMaps: { mapId: MapId; name: string; winRate: number; played: number }[];
  /** Ativas, das mais relevantes para as outras. */
  badges: PickBadge[];
}
