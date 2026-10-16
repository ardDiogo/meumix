/**
 * Modelo de domínio do MeuMix.
 *
 * Espelha o schema em `supabase/migrations/0001_init.sql`. Campos opcionais
 * (`?` ou `null`) existem para que estatísticas avançadas possam ser
 * preenchidas aos poucos, sem bloquear o registro de um mix.
 */

export type ID = string;
/** Data/hora em ISO 8601 (UTC). */
export type ISODateString = string;

/* ---------------------------------- Contas --------------------------------- */

export interface User {
  id: ID;
  email: string;
  displayName: string;
  /** Jogador vinculado a esta conta (um usuário pode ainda não ter jogador). */
  playerId: ID | null;
  createdAt: ISODateString;
}

/* ------------------------------- Comunidades ------------------------------- */

export type CommunityRole = "owner" | "admin" | "organizer" | "player";

export interface Community {
  id: ID;
  slug: string;
  name: string;
  description?: string;
  /** ELO inicial atribuído a novos jogadores da comunidade. */
  startingElo: number;
  createdAt: ISODateString;
}

/** Um jogador pode participar de várias comunidades, cada uma com seu ELO. */
export interface CommunityMembership {
  communityId: ID;
  playerId: ID;
  role: CommunityRole;
  elo: number;
  joinedAt: ISODateString;
}

/* -------------------------------- Jogadores -------------------------------- */

export interface Player {
  id: ID;
  nickname: string;
  realName?: string;
  avatarUrl: string | null;
  /** SteamID64. `null` enquanto o perfil não for vinculado. */
  steamId: string | null;
  country?: string;
  createdAt: ISODateString;
}

/* ---------------------------------- Mapas ---------------------------------- */

export type MapId =
  | "de_mirage"
  | "de_inferno"
  | "de_nuke"
  | "de_ancient"
  | "de_anubis"
  | "de_dust2"
  | "de_train"
  | "de_overpass"
  | "de_vertigo";

export interface GameMap {
  id: MapId;
  name: string;
  /** Faz parte do pool ativo da comunidade. */
  active: boolean;
}

/* ---------------------------------- Mixes ---------------------------------- */

export type MixStatus = "scheduled" | "live" | "finished" | "cancelled";
export type TeamSide = "A" | "B";

export interface Team {
  side: TeamSide;
  name: string;
  captainId: ID | null;
  playerIds: ID[];
}

export interface MapResult {
  order: number;
  mapId: MapId;
  scoreA: number | null;
  scoreB: number | null;
  /** Lado que venceu o mapa; `null` se não jogado/empate. */
  winner: TeamSide | null;
}

/**
 * Estatística de um jogador em um mapa de um mix.
 * Apenas K/A/D são obrigatórios; o restante é opcional.
 */
export interface PlayerMapStats {
  playerId: ID;
  mapOrder: number;
  side: TeamSide;
  kills: number;
  assists: number;
  deaths: number;
  roundsPlayed?: number;
  damage?: number;
  /** Rounds com kill, assist, sobrevivência ou trade. */
  kastRounds?: number;
  headshotKills?: number;
  firstKills?: number;
  firstDeaths?: number;
  /** Rounds com 2, 3, 4 e 5 abates. */
  multikills?: { k2: number; k3: number; k4: number; k5: number };
  clutchesWon?: number;
  clutchesPlayed?: number;
}

export interface Mix {
  id: ID;
  communityId: ID;
  name: string;
  scheduledAt: ISODateString;
  status: MixStatus;
  organizerIds: ID[];
  teams: [Team, Team];
  maps: MapResult[];
  stats: PlayerMapStats[];
  mvpPlayerId: ID | null;
  twitchUrl: string | null;
  highlightIds: ID[];
}

/* ----------------------------------- ELO ----------------------------------- */

export interface EloHistoryEntry {
  playerId: ID;
  communityId: ID;
  mixId: ID;
  date: ISODateString;
  eloBefore: number;
  eloAfter: number;
  result: "win" | "loss" | "draw";
}

/* -------------------------------- Highlights ------------------------------- */

export type HighlightKind = "clip" | "ace" | "clutch" | "multikill" | "other";

export interface Highlight {
  id: ID;
  mixId: ID;
  playerId: ID | null;
  kind: HighlightKind;
  title: string;
  /** URL do clipe (Twitch, YouTube, etc). `null` quando ainda sem mídia. */
  url: string | null;
  createdAt: ISODateString;
}

/* -------------------------- Integrações externas -------------------------- */

export type IntegrationProvider = "steam" | "csrep" | "twitch";
export type IntegrationStatus = "not_implemented" | "disconnected" | "connected" | "error";

export interface ExternalAccountLink {
  playerId: ID;
  provider: IntegrationProvider;
  externalId: string;
  linkedAt: ISODateString;
}
