/**
 * Utilitários da integração com a Steam.
 *
 * A integração real (Steam OpenID para vincular contas e Steam Web API para
 * avatar/nickname) ainda NÃO está implementada. Quando for, as chamadas à
 * API devem rodar somente no servidor usando `STEAM_WEB_API_KEY`.
 */
const STEAM_ID64 = /^7656119\d{10}$/;

export function isValidSteamId64(value: string) {
  return STEAM_ID64.test(value);
}

export function steamProfileUrl(steamId: string | null) {
  return steamId && isValidSteamId64(steamId) ? `https://steamcommunity.com/profiles/${steamId}` : null;
}
