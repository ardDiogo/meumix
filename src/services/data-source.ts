import type { Community, EloHistoryEntry, Highlight, ID, Mix, MixStatus, Player } from "@/types/domain";
import type { DataSourceKind } from "@/types/views";

export interface ListMixesOptions {
  playerId?: ID;
  status?: MixStatus | MixStatus[];
  limit?: number;
}

/**
 * Contrato de acesso a dados. A UI e as consultas (`queries.ts`) dependem
 * apenas desta interface — trocar a demo pelo Supabase não exige mudar páginas.
 */
export interface DataSource {
  readonly kind: DataSourceKind;
  /** "Agora" usado nos filtros de período. Na demo é uma data fixa. */
  now(): Date;

  getCommunity(): Promise<Community>;
  /** Jogador vinculado ao usuário autenticado. */
  getCurrentPlayerId(): Promise<ID | null>;

  listPlayers(): Promise<Player[]>;
  getPlayer(id: ID): Promise<Player | null>;
  /** ELO atual de cada jogador na comunidade. */
  getElos(): Promise<Map<ID, number>>;

  /** Mixes ordenados do mais recente para o mais antigo. */
  listMixes(options?: ListMixesOptions): Promise<Mix[]>;
  getMix(id: ID): Promise<Mix | null>;

  /** Histórico de ELO em ordem cronológica. */
  getEloHistory(playerId?: ID): Promise<EloHistoryEntry[]>;

  listHighlights(): Promise<Highlight[]>;
}
