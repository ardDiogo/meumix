"use server";

import { revalidatePath } from "next/cache";
import { aliasKey } from "@/lib/alias";
import { homeSideOf, sanitizeGcMap } from "@/lib/championship-gc";
import type { PlayoffFormat } from "@/lib/championship";
import { nextSlot } from "@/lib/championship-playoffs";
import { mapScoreProblem, seriesState } from "@/lib/championship-standings";
import { gcAlias, storeGcMap } from "@/lib/gc-api";
import { MAPS } from "@/lib/maps";
import { audit } from "@/services/audit";
import { requireOrganizer, syncChampionshipStatus } from "@/services/championship-guard";

export type ResultResult = { ok: boolean; message: string };

const MIGRATION = "Rode a migração 0041_championship_results.sql no Supabase.";
const missing = (code?: string) => code === "42P01" || code === "PGRST205" || code === "42703";
const validId = (id: string) => /^[0-9a-f-]{36}$/i.test(id);
const validMap = (id: string) => id in MAPS || /^de_[a-z0-9_]{2,28}$/.test(id);

function refresh() {
  revalidatePath("/campeonatos", "layout");
}

/** Organizador + o jogo e os mapas já registrados. */
async function load(championshipId: string, matchId: string) {
  const r = await requireOrganizer(championshipId);
  if ("error" in r) return { error: r.error ?? "Não foi possível salvar." } as const;
  if (!validId(matchId)) return { error: "Jogo inválido." } as const;
  const [{ data: match }, { data: maps, error }] = await Promise.all([
    r.admin
      .from("championship_matches")
      .select("id, stage, round, leg, home_team, away_team, best_of, status, scheduled_at")
      .eq("id", matchId)
      .eq("championship_id", championshipId)
      .maybeSingle(),
    r.admin
      .from("championship_match_maps")
      .select("id, map_order, score_home, score_away")
      .eq("match_id", matchId)
      .order("map_order"),
  ]);
  if (error) return { error: missing(error.code) ? MIGRATION : "Não foi possível salvar." } as const;
  if (!match || !match.home_team || !match.away_team) return { error: "Jogo não encontrado." } as const;
  return {
    ...r,
    match: {
      id: match.id as string,
      home: match.home_team as string,
      away: match.away_team as string,
      bestOf: match.best_of as number,
      status: match.status as string,
      scheduledAt: (match.scheduled_at as string | null) ?? null,
      stage: match.stage as string,
      round: match.round as number,
      leg: match.leg as number,
    },
    maps: (maps ?? []).map((m) => ({
      id: m.id as string,
      order: m.map_order as number,
      home: m.score_home as number,
      away: m.score_away as number,
    })),
  } as const;
}

type Loaded = Exclude<Awaited<ReturnType<typeof load>>, { error: string }>;

/**
 * Recalcula o jogo a partir dos mapas: vencedor quando alguém fecha a série
 * (Finalizada); mapas sem vencedor ainda = Em andamento; sem mapas volta
 * para Agendada (ou Aguardando agendamento, sem data).
 */
async function settle(r: Loaded, championshipId: string) {
  const { data: maps } = await r.admin
    .from("championship_match_maps")
    .select("score_home, score_away")
    .eq("match_id", r.match.id);
  const scores = (maps ?? []).map((m) => ({ home: m.score_home as number, away: m.score_away as number }));
  const s = seriesState(scores, r.match.bestOf);
  const status = s.winner
    ? "finished"
    : scores.length
      ? "live"
      : r.match.status === "live" || r.match.status === "finished"
        ? r.match.scheduledAt
          ? "scheduled"
          : "pending"
        : r.match.status;
  await r.admin
    .from("championship_matches")
    .update({
      status,
      winner_team: s.winner === "home" ? r.match.home : s.winner === "away" ? r.match.away : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", r.match.id)
    .eq("championship_id", championshipId);
  if (r.match.stage === "playoff") await advance(r, championshipId, s.winner);
  // Campeão definido (ou desfeito): o status do campeonato acompanha.
  await syncChampionshipStatus(r.admin, championshipId);
  return s;
}

/**
 * Playoffs: o vencedor ocupa o lugar dele no jogo seguinte da chave. Se o
 * resultado for desfeito, o lugar volta a ficar vazio (enquanto o jogo
 * seguinte não tiver placar).
 */
async function advance(r: Loaded, championshipId: string, winner: "home" | "away" | null) {
  const { data: ch } = await r.admin
    .from("championships")
    .select("playoff_format")
    .eq("id", championshipId)
    .maybeSingle();
  const slot = nextSlot((ch?.playoff_format as PlayoffFormat) ?? "none", r.match.round, r.match.leg);
  if (!slot) return;
  const { data: next } = await r.admin
    .from("championship_matches")
    .select("id")
    .eq("championship_id", championshipId)
    .eq("stage", "playoff")
    .eq("round", slot.round)
    .eq("leg", slot.leg)
    .maybeSingle();
  if (!next) return;
  const { count } = await r.admin
    .from("championship_match_maps")
    .select("id", { count: "exact", head: true })
    .eq("match_id", next.id as string);
  if (count) return;
  const team = winner === "home" ? r.match.home : winner === "away" ? r.match.away : null;
  await r.admin
    .from("championship_matches")
    .update({ [slot.side === "home" ? "home_team" : "away_team"]: team, updated_at: new Date().toISOString() })
    .eq("id", next.id as string);
}

const doneMessage = (s: ReturnType<typeof seriesState>) =>
  s.winner ? `Resultado salvo: ${s.home} × ${s.away}, jogo finalizado.` : `Mapa salvo (${s.home} × ${s.away}).`;

/** Mapa digitado pela organização (novo ou correção de um já registrado). */
export async function saveMapResult(
  championshipId: string,
  matchId: string,
  input: { order: number; mapId: string; home: number; away: number },
): Promise<ResultResult> {
  const r = await load(championshipId, matchId);
  if ("error" in r) return { ok: false, message: r.error ?? "" };
  if (!(Number.isInteger(input.order) && input.order >= 1 && input.order <= r.match.bestOf))
    return { ok: false, message: `Este jogo é MD${r.match.bestOf}.` };
  if (!validMap(input.mapId)) return { ok: false, message: "Escolha o mapa." };
  const problem = mapScoreProblem({ home: input.home, away: input.away });
  if (problem) return { ok: false, message: problem };
  const existing = r.maps.find((m) => m.order === input.order);
  // Não deixa somar mapa depois que a série já foi decidida.
  const others = r.maps.filter((m) => m.order !== input.order);
  if (!existing && seriesState(others, r.match.bestOf).winner)
    return { ok: false, message: "A série já tem vencedor: corrija um mapa existente." };
  if (!existing && input.order !== r.maps.length + 1)
    return { ok: false, message: `Registre os mapas em ordem (próximo: mapa ${r.maps.length + 1}).` };
  const row = { map_id: input.mapId, score_home: input.home, score_away: input.away, recorded_by: r.session.id };
  const { error } = existing
    ? await r.admin.from("championship_match_maps").update(row).eq("id", existing.id)
    : await r.admin
        .from("championship_match_maps")
        .insert({ ...row, match_id: matchId, championship_id: championshipId, map_order: input.order });
  if (error) return { ok: false, message: missing(error.code) ? MIGRATION : "Não foi possível salvar o mapa." };
  const s = await settle(r, championshipId);
  await audit({
    action: "championship.result",
    outcome: "success",
    actorId: r.session.id,
    detail: { championshipId, matchId, order: input.order, home: input.home, away: input.away },
  });
  refresh();
  return { ok: true, message: doneMessage(s) };
}

/** Apaga um mapa (o último, para manter a ordem) — corrige resultado lançado errado. */
export async function deleteMapResult(championshipId: string, matchId: string, order: number): Promise<ResultResult> {
  const r = await load(championshipId, matchId);
  if ("error" in r) return { ok: false, message: r.error ?? "" };
  const last = r.maps.at(-1);
  if (!last || last.order !== order) return { ok: false, message: "Apague a partir do último mapa." };
  const { error } = await r.admin.from("championship_match_maps").delete().eq("id", last.id);
  if (error) return { ok: false, message: "Não foi possível apagar." };
  await settle(r, championshipId);
  await audit({
    action: "championship.result_delete",
    outcome: "success",
    actorId: r.session.id,
    detail: { championshipId, matchId, order },
  });
  refresh();
  return { ok: true, message: `Mapa ${order} apagado.` };
}

/** Marca o jogo como Em andamento (sem placar ainda). */
export async function markLive(championshipId: string, matchId: string): Promise<ResultResult> {
  const r = await load(championshipId, matchId);
  if ("error" in r) return { ok: false, message: r.error ?? "" };
  if (r.match.status === "finished") return { ok: false, message: "O jogo já terminou." };
  await r.admin
    .from("championship_matches")
    .update({ status: "live", updated_at: new Date().toISOString() })
    .eq("id", matchId);
  refresh();
  return { ok: true, message: "Jogo em andamento." };
}

/**
 * Importa um mapa enviado pela GC ("Enviar ao MeuMix"): liga os jogadores
 * (apelido gc:<id> ou SteamID), descobre o lado do mandante pelo elenco e
 * guarda as estatísticas completas. `homeSide` força o lado quando não dá
 * para descobrir.
 */
export async function importGcMap(
  championshipId: string,
  matchId: string,
  raw: unknown,
  mapId: string,
  homeSide: "A" | "B" | null,
): Promise<ResultResult> {
  const r = await load(championshipId, matchId);
  if ("error" in r) return { ok: false, message: r.error ?? "" };
  if (JSON.stringify(raw ?? null).length > 400_000) return { ok: false, message: "Dados da GC grandes demais." };
  const gc = sanitizeGcMap(raw);
  if (!gc) return { ok: false, message: "Dados da GC inválidos. Envie a partida de novo pela GC." };
  if (!validMap(mapId)) return { ok: false, message: "Escolha o mapa." };
  const s0 = seriesState(r.maps, r.match.bestOf);
  if (s0.winner || r.maps.length >= r.match.bestOf)
    return { ok: false, message: "A série já tem vencedor: apague um mapa para importar de novo." };

  // Liga cada jogador da GC ao MeuMix (apelido salvo ou SteamID). Só leitura.
  const keys = gc.players.map((p) => aliasKey(gcAlias(p.gcId)));
  const steams = gc.players.map((p) => p.steamId).filter((s): s is string => !!s);
  const [{ data: aliases }, { data: steamRows }, { data: roster }] = await Promise.all([
    r.admin.from("player_aliases").select("alias_norm, user_id").in("alias_norm", keys),
    steams.length
      ? r.admin.from("profiles").select("id, steam_id").in("steam_id", steams)
      : Promise.resolve({ data: [] as { id: string; steam_id: string }[] }),
    r.admin.from("championship_players").select("user_id, team_id").eq("championship_id", championshipId),
  ]);
  const byAlias = new Map((aliases ?? []).map((a) => [a.alias_norm as string, a.user_id as string]));
  const bySteam = new Map((steamRows ?? []).map((s) => [s.steam_id as string, s.id as string]));
  const userOf = (gcId: string) => {
    const p = gc.players.find((x) => x.gcId === gcId);
    return byAlias.get(aliasKey(gcAlias(gcId))) ?? (p?.steamId ? bySteam.get(p.steamId) : undefined) ?? null;
  };
  const homeRoster = new Set((roster ?? []).filter((p) => p.team_id === r.match.home).map((p) => p.user_id as string));
  const awayRoster = new Set((roster ?? []).filter((p) => p.team_id === r.match.away).map((p) => p.user_id as string));
  const linked = gc.players.map((p) => ({ team: p.team, userId: userOf(p.gcId) }));
  const side = homeSide ?? homeSideOf(linked, homeRoster, awayRoster);
  if (!side)
    return {
      ok: false,
      message:
        "Não deu para saber qual lado da GC é o mandante (jogadores sem vínculo). Escolha o lado e importe de novo.",
    };

  const stored = storeGcMap(gc, mapId, side === "B", userOf);
  const score = { home: stored.scoreA, away: stored.scoreB };
  const problem = mapScoreProblem(score);
  if (problem) return { ok: false, message: `Placar da GC: ${problem}` };
  const { error } = await r.admin.from("championship_match_maps").insert({
    match_id: matchId,
    championship_id: championshipId,
    map_order: r.maps.length + 1,
    map_id: mapId,
    score_home: score.home,
    score_away: score.away,
    gc_match_id: gc.gcMatchId,
    data: stored,
    recorded_by: r.session.id,
  });
  if (error)
    return {
      ok: false,
      message:
        error.code === "23505"
          ? "Essa partida da GC já foi importada neste campeonato."
          : missing(error.code)
            ? MIGRATION
            : "Não foi possível importar.",
    };
  const s = await settle(r, championshipId);
  const unknown = linked.filter((p) => !p.userId).length;
  await audit({
    action: "championship.result_gc",
    outcome: "success",
    actorId: r.session.id,
    detail: { championshipId, matchId, gcMatchId: gc.gcMatchId, unknown },
  });
  refresh();
  return {
    ok: true,
    message: `${doneMessage(s)}${unknown ? ` ${unknown} jogador(es) da GC sem vínculo com o MeuMix.` : ""}`,
  };
}
