"use server";

import { canManageMixes } from "@/lib/auth/permissions";
import { faceitMatchId, parseFaceit } from "@/lib/faceit";
import { mergeMaps, type MergedResult, type OcrMap } from "@/lib/gc-ocr";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { audit } from "@/services/audit";
import { getSession } from "@/services/auth";

export type FaceitResult =
  { ok: true; result: MergedResult; links: Record<string, string> } | { ok: false; message: string };

const API = () => process.env.FACEIT_API_BASE || "https://open.faceit.com/data/v4";

async function get(path: string, key: string) {
  const res = await fetch(`${API()}${path}`, {
    headers: { authorization: `Bearer ${key}`, accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 404) throw new Error("partida não encontrada na Faceit");
  if (res.status === 401 || res.status === 403) throw new Error("FACEIT_API_KEY inválida");
  if (!res.ok) throw new Error(`a Faceit respondeu ${res.status}`);
  return res.json();
}

/**
 * Busca uma ou mais partidas da Faceit (um link por mapa da série) e devolve
 * no formato do formulário. Vincula os jogadores aos perfis pelo SteamID ou
 * pelo ID Faceit salvo; o restante vai pela semelhança de nick.
 */
export async function fetchFaceitMatches(input: string): Promise<FaceitResult> {
  const session = await getSession();
  if (!canManageMixes(session)) return { ok: false, message: "Apenas administradores." };
  const key = process.env.FACEIT_API_KEY;
  if (!key) {
    return { ok: false, message: "Faceit não configurada: cadastre a FACEIT_API_KEY na Vercel (como Secret)." };
  }
  const ids = [
    ...new Set(
      input
        .split(/[\s,;]+/)
        .map(faceitMatchId)
        .filter((x): x is string => !!x),
    ),
  ];
  if (!ids.length) return { ok: false, message: "Cole o link da sala da Faceit (…/room/1-xxxx…)." };
  if (ids.length > 5) return { ok: false, message: "No máximo 5 partidas (um mapa cada)." };

  const maps: OcrMap[] = [];
  const steamOf: Record<string, string> = {};
  const idOf: Record<string, string> = {};
  try {
    for (const id of ids) {
      const [match, stats] = await Promise.all([get(`/matches/${id}`, key), get(`/matches/${id}/stats`, key)]);
      const parsed = parseFaceit(match, stats);
      if (!parsed.maps.length) throw new Error("a partida ainda não tem estatísticas (terminou?)");
      maps.push(...parsed.maps);
      Object.assign(steamOf, parsed.steamOf);
      Object.assign(idOf, parsed.idOf);
    }
  } catch (e) {
    const reason = e instanceof Error ? e.message : "erro";
    await audit({ action: "admin.faceit_fetch", outcome: "error", actorId: session!.id, detail: { reason } });
    return { ok: false, message: `Não foi possível buscar na Faceit (${reason}).` };
  }

  // Vínculo pelo SteamID (ou ID Faceit já salvo) → id do perfil.
  const admin = createSupabaseAdminClient();
  const links: Record<string, string> = {};
  if (admin) {
    const { data: profiles } = await admin.from("profiles").select("id, steam_id, faceit_player_id");
    for (const [nick, playerId] of Object.entries(idOf)) {
      const steam = steamOf[playerId];
      const profile = (profiles ?? []).find((p) => (steam && p.steam_id === steam) || p.faceit_player_id === playerId);
      if (profile) {
        links[nick] = profile.id as string;
        if (profile.faceit_player_id !== playerId) {
          await admin.from("profiles").update({ faceit_player_id: playerId }).eq("id", profile.id);
        }
      }
    }
  }

  const result = mergeMaps(maps);
  result.warnings.unshift("A Faceit não informa RP nem KAST: preencha o RP de cada jogador para calcular o ELO.");
  await audit({
    action: "admin.faceit_fetch",
    outcome: "success",
    actorId: session!.id,
    detail: { partidas: ids.length, jogadores: result.players.length, vinculados: Object.keys(links).length },
  });
  return { ok: true, result, links };
}
