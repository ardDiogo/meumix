/**
 * Integração com a Steam: o jogador informa o link do perfil e o servidor busca
 * SteamID64, nick e foto. Sem chave usa o XML público do perfil
 * (steamcommunity.com/...?xml=1); com `STEAM_WEB_API_KEY` usa a Steam Web API.
 * As chamadas rodam somente no servidor.
 */
const STEAM_ID64 = /^7656119\d{10}$/;
const VANITY = /^[A-Za-z0-9_-]{2,64}$/;

export function isValidSteamId64(value: string) {
  return STEAM_ID64.test(value);
}

export function steamProfileUrl(steamId: string | null) {
  return steamId && isValidSteamId64(steamId) ? `https://steamcommunity.com/profiles/${steamId}` : null;
}

export type SteamInput = { kind: "id64"; value: string } | { kind: "vanity"; value: string };

/**
 * Aceita o link do perfil (…/profiles/7656119… ou …/id/apelido), o SteamID64
 * puro ou o apelido personalizado da URL.
 */
export function parseSteamInput(raw: string): SteamInput | null {
  const text = raw.trim();
  if (!text) return null;
  if (isValidSteamId64(text)) return { kind: "id64", value: text };

  const url = text.match(/steamcommunity\.com\/(profiles|id)\/([^/?#\s]+)/i);
  if (url) {
    const value = decodeURIComponent(url[2]!);
    if (url[1]!.toLowerCase() === "profiles") return isValidSteamId64(value) ? { kind: "id64", value } : null;
    return VANITY.test(value) ? { kind: "vanity", value } : null;
  }
  if (/[/.:]/.test(text)) return null;
  return VANITY.test(text) ? { kind: "vanity", value: text } : null;
}

export interface SteamProfile {
  steamId: string;
  nickname: string | null;
  avatarUrl: string | null;
  profileUrl: string;
}

const AVATAR_HOST = /^https:\/\/([a-z0-9-]+\.)*(steamstatic\.com|steamcdn-a\.akamaihd\.net|steampowered\.com)\//i;

/** Só aceita fotos servidas pela própria Steam. */
export function safeAvatarUrl(url: string | null | undefined) {
  const u = url?.trim().replace(/^http:\/\//i, "https://");
  return u && AVATAR_HOST.test(u) ? u : null;
}

function xmlTag(xml: string, tag: string) {
  const m = xml.match(new RegExp(`<${tag}>\\s*(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([^<]*))\\s*</${tag}>`));
  const v = (m?.[1] ?? m?.[2] ?? "").trim();
  return v || null;
}

/** Lê o XML público do perfil (sem chave). Exportado para testes. */
export function parseSteamXml(xml: string): SteamProfile | { error: string } {
  const error = xmlTag(xml, "error");
  if (error) return { error };
  const steamId = xmlTag(xml, "steamID64");
  if (!steamId || !isValidSteamId64(steamId)) return { error: "Resposta da Steam sem SteamID." };
  return {
    steamId,
    nickname: xmlTag(xml, "steamID"),
    avatarUrl: safeAvatarUrl(xmlTag(xml, "avatarFull") ?? xmlTag(xml, "avatarMedium")),
    profileUrl: steamProfileUrl(steamId)!,
  };
}

const TIMEOUT = 10_000;

async function viaXml(input: SteamInput): Promise<SteamProfile> {
  const path = input.kind === "id64" ? `profiles/${input.value}` : `id/${encodeURIComponent(input.value)}`;
  const res = await fetch(`https://steamcommunity.com/${path}/?xml=1`, {
    headers: { accept: "text/xml" },
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!res.ok) throw new Error(`a Steam respondeu ${res.status}`);
  const parsed = parseSteamXml(await res.text());
  if ("error" in parsed) {
    throw new Error(/could not be found/i.test(parsed.error) ? "perfil não encontrado" : parsed.error);
  }
  return parsed;
}

async function viaApi(input: SteamInput, key: string): Promise<SteamProfile> {
  const api = "https://api.steampowered.com";
  let steamId = input.value;
  if (input.kind === "vanity") {
    const res = await fetch(
      `${api}/ISteamUser/ResolveVanityURL/v1/?key=${key}&vanityurl=${encodeURIComponent(input.value)}`,
      { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT) },
    );
    const body = (await res.json()) as { response?: { success?: number; steamid?: string } };
    if (body.response?.success !== 1 || !body.response.steamid) throw new Error("perfil não encontrado");
    steamId = body.response.steamid;
  }
  const res = await fetch(`${api}/ISteamUser/GetPlayerSummaries/v2/?key=${key}&steamids=${steamId}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!res.ok) throw new Error(`a Steam respondeu ${res.status}`);
  const body = (await res.json()) as {
    response?: { players?: { steamid: string; personaname?: string; avatarfull?: string }[] };
  };
  const p = body.response?.players?.[0];
  if (!p || !isValidSteamId64(p.steamid)) throw new Error("perfil não encontrado");
  return {
    steamId: p.steamid,
    nickname: p.personaname ?? null,
    avatarUrl: safeAvatarUrl(p.avatarfull),
    profileUrl: steamProfileUrl(p.steamid)!,
  };
}

/** Busca o perfil na Steam. Lança erro com mensagem amigável. */
export async function fetchSteamProfile(input: SteamInput): Promise<SteamProfile> {
  const key = process.env.STEAM_WEB_API_KEY;
  if (key) {
    try {
      return await viaApi(input, key);
    } catch {
      // Chave inválida ou API fora: tenta o XML público.
    }
  }
  return viaXml(input);
}
