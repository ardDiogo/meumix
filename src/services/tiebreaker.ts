import "server-only";
import { computeTie, countVotes, lockedMaps, secureSample, sortTally, type Tally } from "@/lib/map-tiebreak";
import { MAPS_IN_ROTATION } from "@/lib/mix-rules";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type Admin = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

export interface RoundRow {
  id: string;
  schedule_id: string;
  event_date: string;
  round_number: 1 | 2;
  status: "voting" | "completed" | "resolved_random";
  candidate_maps: string[];
  slots: number;
  winning_maps: string[];
  random_maps: string[];
}

async function classifiedOf(admin: Admin, scheduleId: string, date: string) {
  const { data } = await admin.rpc("mix_classified", { p_schedule: scheduleId, p_date: date });
  return (data as string[] | null) ?? [];
}

/** Votação principal: contagem só dos classificados, incluindo mapas ativos sem voto. */
export async function mainMapTally(admin: Admin, scheduleId: string, date: string): Promise<Tally> {
  return (await mainMapVotes(admin, scheduleId, date)).tally;
}

/** Contagem da votação principal e quantos classificados ainda não votaram nos mapas. */
export async function mainMapVotes(admin: Admin, scheduleId: string, date: string) {
  const [classified, votes, maps] = await Promise.all([
    classifiedOf(admin, scheduleId, date),
    admin.from("map_votes").select("user_id, map_id").match({ schedule_id: scheduleId, event_date: date }),
    admin.from("maps").select("id").eq("active", true).order("name"),
  ]);
  const ids = (maps.data ?? []).map((m) => m.id as string);
  const ballots = new Map<string, string[]>();
  for (const v of votes.data ?? []) {
    if (!classified.includes(v.user_id as string)) continue;
    ballots.set(v.user_id as string, [...(ballots.get(v.user_id as string) ?? []), v.map_id as string]);
  }
  return { tally: countVotes(ids, [...ballots.values()]), remaining: Math.max(0, classified.length - ballots.size) };
}

/**
 * 'detect' (idempotente): com a lista fechada e a chave ligada, abre o Round 1 se o
 * 4º lugar estiver empatado com todos os classificados votando (antes do PICK).
 */
export async function detectTiebreaker(scheduleId: string, date: string, force = false) {
  const admin = createSupabaseAdminClient();
  if (!admin) return;
  const match = { schedule_id: scheduleId, event_date: date };
  const [{ data: feature }, { data: schedule }, { data: existing }] = await Promise.all([
    admin.from("feature_settings").select("enabled").eq("feature_key", "map_tiebreaker").maybeSingle(),
    admin.from("mix_schedules").select("max_players").eq("id", scheduleId).maybeSingle(),
    admin.from("map_tiebreaker_rounds").select("id").match(match).limit(1),
  ]);
  if (feature && !feature.enabled) return;
  if (existing?.length) return;
  // Os mapas se definem antes do PICK, com a lista fechada.
  const classified = await classifiedOf(admin, scheduleId, date);
  if (classified.length < ((schedule?.max_players as number | undefined) ?? 10)) return;

  const { tally, remaining } = await mainMapVotes(admin, scheduleId, date);
  // Como nos capitães: só decide quando os votos que faltam não mudam o resultado.
  // Com votos faltando e o top 4 em aberto, espera (o admin pode forçar).
  if (!force && remaining > 0) return;
  const tie = computeTie(tally, MAPS_IN_ROTATION);
  if (!tie.tie) return;
  await admin
    .from("map_tiebreaker_rounds")
    .upsert(
      { ...match, round_number: 1, candidate_maps: tie.zone, slots: tie.slots },
      { onConflict: "schedule_id,event_date,round_number", ignoreDuplicates: true },
    );
}

/**
 * 'close' (idempotente): exige o voto de todos os classificados (ou que os votos que
 * faltam já não mudem o resultado), a menos que `force`.
 * Sem empate → completed; empate no round 1 → abre round 2; empate no round 2 → sorteio.
 */
export async function closeRound(roundId: string, force = false): Promise<{ ok: boolean; message: string }> {
  const admin = createSupabaseAdminClient();
  if (!admin) return { ok: false, message: "Servidor não configurado." };
  const { data: round } = await admin.from("map_tiebreaker_rounds").select("*").eq("id", roundId).maybeSingle();
  if (!round) return { ok: false, message: "Round não encontrado." };
  const r = round as RoundRow;
  if (r.status !== "voting") return { ok: true, message: "Round já encerrado." };

  const classified = await classifiedOf(admin, r.schedule_id, r.event_date);
  const { data: votes } = await admin.from("map_tiebreaker_votes").select("user_id, maps").eq("round_id", roundId);
  const valid = (votes ?? []).filter((v) => classified.includes(v.user_id as string));
  const tally = countVotes(
    r.candidate_maps,
    valid.map((v) => v.maps as string[]),
  );
  // Fecha antes de todos votarem quando os votos que faltam já não mudam o resultado.
  if (!force && valid.length < classified.length) {
    if (!lockedMaps(tally, r.slots, classified.length - valid.length).decided)
      return { ok: false, message: `Aguardando votos (${valid.length}/${classified.length}).` };
  }

  const tie = computeTie(tally, r.slots);
  const closedAt = new Date().toISOString();
  let update: Partial<RoundRow> & { closed_at: string };
  if (!tie.tie) {
    update = { status: "completed", winning_maps: [...tie.guaranteed, ...tie.zone], closed_at: closedAt };
  } else if (r.round_number === 1) {
    update = { status: "completed", winning_maps: tie.guaranteed, closed_at: closedAt };
  } else {
    const drawn = secureSample(tie.zone, tie.slots);
    update = { status: "resolved_random", winning_maps: tie.guaranteed, random_maps: drawn, closed_at: closedAt };
  }

  // Só fecha se ainda estiver em votação (evita processamento duplicado).
  const { data: claimed } = await admin
    .from("map_tiebreaker_rounds")
    .update(update)
    .eq("id", roundId)
    .eq("status", "voting")
    .select("id");
  if (!claimed?.length) return { ok: true, message: "Round já encerrado." };

  if (tie.tie && r.round_number === 1) {
    await admin.from("map_tiebreaker_rounds").upsert(
      {
        schedule_id: r.schedule_id,
        event_date: r.event_date,
        round_number: 2,
        candidate_maps: tie.zone,
        slots: tie.slots,
      },
      { onConflict: "schedule_id,event_date,round_number", ignoreDuplicates: true },
    );
    return { ok: true, message: "Empate persistiu: Round 2 aberto." };
  }
  return { ok: true, message: update.status === "resolved_random" ? "Decidido por sorteio." : "Desempate concluído." };
}

/** Mapas finais: garantidos da votação principal + vencedores dos rounds. */
export function finalMaps(main: Tally, rounds: RoundRow[], tiebreakerEnabled: boolean, remaining = 0) {
  const tie = computeTie(main, MAPS_IN_ROTATION);
  if (!rounds.length && remaining > 0) {
    // Votos faltando: só os mapas que eles já não conseguem tirar do top 4.
    const lock = lockedMaps(main, MAPS_IN_ROTATION, remaining);
    return { maps: lock.locked, random: [] as string[], pending: !lock.decided, waiting: !lock.decided };
  }
  if (!rounds.length) {
    // Desempate desligado: vale a ordem da apuração.
    if (!tie.tie || !tiebreakerEnabled) {
      return {
        maps: [...tie.guaranteed, ...tie.zone.slice(0, tie.slots)],
        random: [] as string[],
        pending: false,
        waiting: false,
      };
    }
    return { maps: tie.guaranteed, random: [] as string[], pending: true, waiting: false };
  }
  const r1 = rounds.find((r) => r.round_number === 1);
  const r2 = rounds.find((r) => r.round_number === 2);
  // Garantidos = os mais votados fora do desempate, só o que sobra das vagas (os votos
  // podem ter mudado depois que o desempate abriu; as vagas do desempate não mudam).
  const zone = new Set(r1?.candidate_maps ?? []);
  const guaranteed = r1
    ? sortTally(main)
        .filter((m) => !zone.has(m.id))
        .slice(0, MAPS_IN_ROTATION - r1.slots)
        .map((m) => m.id)
    : tie.guaranteed;
  const maps = [
    ...guaranteed,
    ...(r1?.winning_maps ?? []),
    ...(r2?.winning_maps ?? []),
    ...(r2?.random_maps ?? []),
  ];
  const pending = rounds.some((r) => r.status === "voting");
  return { maps, random: r2?.random_maps ?? [], pending, waiting: false };
}

/**
 * Admin encerra a votação de mapas com os votos atuais (alguém não votou e o top 4
 * segue em aberto). Empate na última vaga → abre o desempate; sem empate → grava um
 * round já concluído com os mapas da linha de corte. Depois disso, a votação de mapas
 * fica fechada (os votos não mudam mais o resultado).
 */
export async function forceMapDecision(scheduleId: string, date: string) {
  const admin = createSupabaseAdminClient();
  if (!admin) return { ok: false, message: "Servidor não configurado." };
  const match = { schedule_id: scheduleId, event_date: date };
  const { data: existing } = await admin.from("map_tiebreaker_rounds").select("id").match(match).limit(1);
  if (existing?.length) return { ok: true, message: "A votação de mapas já está encerrada." };
  const tie = computeTie(await mainMapTally(admin, scheduleId, date), MAPS_IN_ROTATION);
  const row = tie.tie
    ? { ...match, round_number: 1, candidate_maps: tie.zone, slots: tie.slots }
    : {
        ...match,
        round_number: 1,
        candidate_maps: tie.zone,
        slots: tie.slots,
        status: "completed",
        winning_maps: tie.zone,
        closed_at: new Date().toISOString(),
      };
  const { error } = await admin
    .from("map_tiebreaker_rounds")
    .upsert(row, { onConflict: "schedule_id,event_date,round_number", ignoreDuplicates: true });
  if (error) return { ok: false, message: "Não foi possível encerrar a votação de mapas." };
  return {
    ok: true,
    message: tie.tie
      ? "Votação encerrada: empate na última vaga, desempate aberto."
      : "Votação encerrada: mapas definidos.",
    tiebreak: tie.tie,
  };
}

/**
 * Mapas definidos (o PICK pode começar): os votos que faltam já não mudam o top 4,
 * ou todos votaram e não há empate, ou o desempate já terminou.
 */
export async function mapsReady(scheduleId: string, date: string) {
  const admin = createSupabaseAdminClient();
  if (!admin) return true;
  const match = { schedule_id: scheduleId, event_date: date };
  const [{ data: rounds }, { data: feature }] = await Promise.all([
    admin.from("map_tiebreaker_rounds").select("status").match(match),
    admin.from("feature_settings").select("enabled").eq("feature_key", "map_tiebreaker").maybeSingle(),
  ]);
  if (rounds?.length) return !rounds.some((r) => r.status === "voting");
  const { tally, remaining } = await mainMapVotes(admin, scheduleId, date);
  // Sem desempate ligado: com todos votando, vale a ordem da apuração.
  if (feature && !feature.enabled && remaining === 0) return true;
  return lockedMaps(tally, MAPS_IN_ROTATION, remaining).decided;
}
