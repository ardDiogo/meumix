import "server-only";
import {
  getLiveStreams,
  getTwitchUsers,
  getVideos,
  twitchConfigured,
  type TwitchStream,
} from "@/lib/integrations/twitch-api";
import type { StreamItem } from "@/components/twitch/twitch-streams";
import { formatInt } from "@/lib/format";
import { playerHref } from "@/lib/player-slug";
import { mixBroadcastWindow, parseTwitchLogin, twitchChannelUrl, twitchPlayerUrl, twitchVideoUrl } from "@/lib/twitch";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Player } from "@/types/domain";

/**
 * Canal da Twitch de cada perfil. Falha aberta: sem a migração 0022 devolve um
 * mapa vazio e as telas simplesmente não mostram a Twitch.
 */
export async function profileTwitch(ids?: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (ids && !ids.length) return map;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return map;
  let query = supabase.from("profiles").select("id, twitch_login").not("twitch_login", "is", null);
  if (ids) query = query.in("id", [...new Set(ids)]);
  const { data, error } = await query;
  if (error) return map;
  for (const p of data ?? []) if (p.twitch_login) map.set(p.id as string, p.twitch_login as string);
  return map;
}

export interface LiveChannel extends TwitchStream {
  playerId: string;
}

/** Jogadores ao vivo agora (opcionalmente só entre `ids`). Nunca lança erro. */
export async function liveChannels(ids?: string[]): Promise<LiveChannel[]> {
  if (!twitchConfigured()) return [];
  try {
    const logins = await profileTwitch(ids);
    if (!logins.size) return [];
    const byLogin = new Map([...logins].map(([id, login]) => [login, id]));
    const streams = await getLiveStreams([...byLogin.keys()]);
    return streams
      .filter((s) => byLogin.has(s.login))
      .map((s) => ({ ...s, playerId: byLogin.get(s.login)! }))
      .sort((a, b) => b.viewers - a.viewers);
  } catch (e) {
    console.error("[twitch] lives:", e instanceof Error ? e.message : e);
    return [];
  }
}

export interface MixBroadcast {
  playerId: string;
  login: string;
  /** Live acontecendo agora (player do canal) ou gravação (player do vídeo). */
  live: boolean;
  videoId: string | null;
  title: string;
  startedAt: string;
  durationSec: number | null;
  thumbnailUrl: string | null;
  highlight: boolean;
}

/**
 * Transmissões dos jogadores de um mix: gravações e destaques que cruzam a
 * janela do mix e, se o mix é hoje, quem está ao vivo. Nunca lança erro.
 */
export async function mixBroadcasts(scheduledAt: string, playerIds: string[]): Promise<MixBroadcast[]> {
  if (!twitchConfigured() || !playerIds.length) return [];
  try {
    const logins = await profileTwitch(playerIds);
    if (!logins.size) return [];
    const { start, end } = mixBroadcastWindow(scheduledAt);
    const now = Date.now();
    const users = await getTwitchUsers([...logins.values()]);
    const userByLogin = new Map(users.map((u) => [u.login, u]));
    const result: MixBroadcast[] = [];

    const live = now >= start.getTime() && now <= end.getTime() ? await getLiveStreams([...logins.values()]) : [];
    const liveLogins = new Set(live.map((s) => s.login));

    await Promise.all(
      [...logins].map(async ([playerId, login]) => {
        const stream = live.find((s) => s.login === login);
        if (stream) {
          result.push({
            playerId,
            login,
            live: true,
            videoId: null,
            title: stream.title,
            startedAt: stream.startedAt,
            durationSec: null,
            thumbnailUrl: stream.thumbnailUrl,
            highlight: false,
          });
        }
        const user = userByLogin.get(login);
        if (!user || liveLogins.has(login)) return;
        const videos = (await getVideos(user.id)).filter((v) => {
          if (v.type === "upload") return false;
          const from = new Date(v.createdAt).getTime();
          const to = from + v.durationSec * 1000;
          return from < end.getTime() && to > start.getTime();
        });
        // Um vídeo por jogador: prefere o destaque (não expira); senão a gravação mais longa.
        const best = [...videos].sort(
          (a, b) => Number(b.type === "highlight") - Number(a.type === "highlight") || b.durationSec - a.durationSec,
        )[0];
        if (best) {
          result.push({
            playerId,
            login,
            live: false,
            videoId: best.id,
            title: best.title,
            startedAt: best.createdAt,
            durationSec: best.durationSec,
            thumbnailUrl: best.thumbnailUrl,
            highlight: best.type === "highlight",
          });
        }
      }),
    );
    return result.sort((a, b) => Number(b.live) - Number(a.live) || a.startedAt.localeCompare(b.startedAt));
  } catch (e) {
    console.error("[twitch] transmissões do mix:", e instanceof Error ? e.message : e);
    return [];
  }
}

const timeFmt = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
const hm = (sec: number) => `${Math.floor(sec / 3600)}h${String(Math.floor((sec % 3600) / 60)).padStart(2, "0")}`;

/** Lives e gravações prontas para o cartão (jogador, player e legenda). */
export function toStreamItems(
  entries: (LiveChannel | MixBroadcast)[],
  players: Map<string, Pick<Player, "id" | "nickname" | "avatarUrl">>,
): StreamItem[] {
  return entries.flatMap((e) => {
    const p = players.get(e.playerId);
    if (!p) return [];
    const live = "viewers" in e || e.live;
    const videoId = "videoId" in e ? e.videoId : null;
    const meta = live
      ? `${"viewers" in e ? `${formatInt(e.viewers)} assistindo · ` : ""}desde ${timeFmt.format(new Date(e.startedAt))}`
      : `${"highlight" in e && e.highlight ? "Destaque" : "Gravação"} · ${timeFmt.format(new Date(e.startedAt))}${
          "durationSec" in e && e.durationSec ? ` · ${hm(e.durationSec)}` : ""
        }`;
    return [
      {
        key: `${e.playerId}:${videoId ?? "live"}`,
        playerName: p.nickname,
        playerHref: playerHref(p),
        avatarUrl: p.avatarUrl,
        live,
        src: videoId ? twitchPlayerUrl({ video: videoId }) : twitchPlayerUrl({ channel: e.login }, true),
        url: videoId ? twitchVideoUrl(videoId) : twitchChannelUrl(e.login),
        title: e.title,
        meta,
      },
    ];
  });
}

/** Valida o canal: `login` null = remover. */
export async function resolveTwitchLogin(
  input: string,
): Promise<{ ok: true; login: string | null } | { ok: false; message: string }> {
  if (!input.trim()) return { ok: true, login: null };
  const parsed = parseTwitchLogin(input);
  if (!parsed) return { ok: false, message: "Canal inválido. Ex.: https://www.twitch.tv/seucanal" };
  if (!twitchConfigured()) return { ok: true, login: parsed };
  try {
    const [user] = await getTwitchUsers([parsed]);
    if (!user) return { ok: false, message: `O canal “${parsed}” não existe na Twitch.` };
    return { ok: true, login: user.login };
  } catch {
    // Twitch fora do ar: salva assim mesmo.
    return { ok: true, login: parsed };
  }
}
