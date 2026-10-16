"use server";

import { revalidatePath } from "next/cache";
import { canManageMixes } from "@/lib/auth/permissions";
import { pickMvpAndLanterna } from "@/lib/match-rules";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { audit } from "@/services/audit";
import { getSession } from "@/services/auth";

export interface FinalizeMap {
  mapId: string;
  scoreA: number;
  scoreB: number;
}

export interface FinalizePlayer {
  userId: string | null;
  name: string;
  team: "A" | "B";
  kills: number;
  deaths: number;
  assists: number;
  firstKills: number;
  adr: number | null;
  kast: number | null;
  rp: number;
  calculateElo: boolean;
}

export type FinalizeResult = { ok: true; matchId: string } | { ok: false; message: string };

const isInt = (n: unknown, min: number, max: number) =>
  Number.isInteger(n) && (n as number) >= min && (n as number) <= max;
const isNum = (n: unknown, min: number, max: number) =>
  n === null || (typeof n === "number" && Number.isFinite(n) && n >= min && n <= max);

/** Finaliza o mix: grava a partida e aplica o ELO (função `finalize_mix` no banco). */
export async function finalizeMix(input: {
  scheduleId: string;
  date: string;
  platform: "manual" | "gc";
  maps: FinalizeMap[];
  players: FinalizePlayer[];
}): Promise<FinalizeResult> {
  const session = await getSession();
  if (!canManageMixes(session)) return { ok: false, message: "Apenas administradores podem finalizar mixes." };
  const admin = createSupabaseAdminClient();
  if (!admin) return { ok: false, message: "O banco de dados não está configurado no servidor." };

  const { maps, players } = input;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { ok: false, message: "Data inválida." };
  if (!maps.length || maps.length > 5) return { ok: false, message: "Informe de 1 a 5 mapas." };
  for (const m of maps) {
    if (!m.mapId || !isInt(m.scoreA, 0, 60) || !isInt(m.scoreB, 0, 60)) {
      return { ok: false, message: "Confira os placares dos mapas (números inteiros de 0 a 60)." };
    }
  }
  const { data: active } = await admin
    .from("maps")
    .select("id")
    .in("id", [...new Set(maps.map((m) => m.mapId))]);
  if ((active ?? []).length !== new Set(maps.map((m) => m.mapId)).size) return { ok: false, message: "Mapa inválido." };

  if (players.length < 2) return { ok: false, message: "Informe as estatísticas de pelo menos 2 jogadores." };
  const seen = new Set<string>();
  for (const p of players) {
    if (!p.name.trim() || (p.team !== "A" && p.team !== "B"))
      return { ok: false, message: "Jogador sem nome ou time." };
    if (p.userId) {
      if (seen.has(p.userId)) return { ok: false, message: `${p.name} aparece duas vezes.` };
      seen.add(p.userId);
    }
    if (![p.kills, p.deaths, p.assists, p.firstKills].every((n) => isInt(n, 0, 500))) {
      return { ok: false, message: `Confira K, A, D e FK de ${p.name}.` };
    }
    if (!isNum(p.adr, 0, 500) || !isNum(p.kast, 0, 100) || !isInt(p.rp, -200, 200)) {
      return { ok: false, message: `Confira ADR (0–500), KAST (0–100) e RP (−200 a 200) de ${p.name}.` };
    }
  }

  const { mvp, lanterna } = pickMvpAndLanterna(players);
  const { data, error } = await admin.rpc("finalize_mix", {
    p_schedule: input.scheduleId,
    p_date: input.date,
    p_platform: input.platform === "gc" ? "gc" : "manual",
    p_maps: maps.map((m) => ({ map_id: m.mapId, score_a: m.scoreA, score_b: m.scoreB })),
    p_players: players.map((p, i) => ({
      user_id: p.userId,
      player_name: p.name.trim(),
      team: p.team,
      kills: p.kills,
      deaths: p.deaths,
      assists: p.assists,
      first_kills: p.firstKills,
      adr: p.adr,
      kast: p.kast,
      rp: p.rp,
      is_mvp: i === mvp,
      is_lanterna: i === lanterna,
      calculate_elo: p.calculateElo,
    })),
    p_by: session!.id,
  });
  if (error?.code === "23505") return { ok: false, message: "Este mix já foi finalizado." };
  if (error) return { ok: false, message: "Não foi possível finalizar o mix." };

  await audit({
    action: "admin.finalize_mix",
    outcome: "success",
    actorId: session!.id,
    scheduleId: input.scheduleId,
    eventDate: input.date,
    detail: { match_id: data, players: players.length, maps: maps.length, platform: input.platform },
  });
  for (const path of ["/dashboard", "/rankings", "/mixes", "/jogadores", "/estatisticas"])
    revalidatePath(path, "layout");
  return { ok: true, matchId: data as string };
}
