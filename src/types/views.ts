import type { EloHistoryEntry, ID, Mix, Player, TeamSide } from "./domain";

/** Origem dos dados exibidos. A UI deve sinalizar sempre que for "demo". */
export type DataSourceKind = "demo" | "supabase";

/** Estatísticas agregadas de um jogador em um conjunto de mixes. */
export interface PlayerAggregate {
  mixes: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  kills: number;
  assists: number;
  deaths: number;
  kd: number;
  /** `null` quando nenhum mix do período possui dano registrado. */
  adr: number | null;
  /** Percentual 0–100. `null` quando não houver dados. */
  kast: number | null;
  firstKills: number;
  clutchesWon: number;
  mvps: number;
}

export interface RankingRow {
  position: number;
  player: Player;
  elo: number;
  eloChange: number;
  stats: PlayerAggregate;
}

export type RankingPeriod = "7d" | "30d" | "90d" | "all";

/** Linha de uma tabela de placar (mix inteiro ou um mapa). */
export interface ScoreboardRow {
  player: Player;
  side: TeamSide;
  kills: number;
  assists: number;
  deaths: number;
  diff: number;
  kd: number;
  adr: number | null;
  kast: number | null;
  hsPercent: number | null;
  firstKills: number | null;
  firstDeaths: number | null;
  multikills: number | null;
  clutches: string | null;
}

export interface PlayerMixResult {
  mix: Mix;
  side: TeamSide;
  result: "win" | "loss" | "draw";
  kills: number;
  assists: number;
  deaths: number;
  adr: number | null;
  isMvp: boolean;
}

export interface PlayerProfile {
  player: Player;
  elo: number;
  position: number | null;
  totalPlayers: number;
  stats: PlayerAggregate;
  eloHistory: EloHistoryEntry[];
  recentMixes: PlayerMixResult[];
}

export interface Highlights {
  lastMvp: { mix: Mix; player: Player } | null;
  bestRecent: PlayerMixResult | null;
  clutchesWon: number;
  firstKills: number;
}

export type { ID };
