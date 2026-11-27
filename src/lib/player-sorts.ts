/** Ordenações da página de jogadores (compartilhadas entre o servidor e o filtro). */
export const PLAYER_SORTS = {
  elo: "ELO",
  wr: "Win rate",
  kdr: "KDR",
  mixes: "Mixes",
  forma: "Forma (30 dias)",
  nome: "Nome",
} as const;
export type PlayerSort = keyof typeof PLAYER_SORTS;
