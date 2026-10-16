/**
 * Endereço amigável do perfil: /jogadores/<nick> (ex.: "twitch.tv/paiked1" →
 * "twitch-tv-paiked1"). O endereço com o id continua funcionando.
 */
export function playerSlug(nickname: string) {
  return (
    nickname
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "jogador"
  );
}

export const playerHref = (player: { id: string; nickname: string }) => `/jogadores/${playerSlug(player.nickname)}`;
