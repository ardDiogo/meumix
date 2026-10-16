import "server-only";
import { computeTie, countVotes, secureSample, type Tally } from "@/lib/map-tiebreak";
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
  return countVotes(ids, [...ballots.values()]);
}

/**
 * 'detect' (idempotente): com a escolha dos times concluída e a chave ligada,
 * abre o Round 1 se o 4º lugar estiver empatado.
 */
export async function detectTiebreaker(scheduleId: string, date: string) {
  const admin = createSupabaseAdminClient();
  if (!admin) return;
  const match = { schedule_id: scheduleId, event_date: date };
  const [{ data: feature }, { data: draft }, { data: existing }] = await Promise.all([
    admin.from("feature_settings").select("enabled").eq("feature_key", "map_tiebreaker").maybeSingle(),
    admin.from("mix_draft_state").select("status").match(match).maybeSingle(),
    admin.from("map_tiebreaker_rounds").select("id").match(match).limit(1),
  ]);
  if (feature && !feature.enabled) return;
  if (draft?.status !== "completed" || existing?.length) return;

  const tie = computeTie(await mainMapTally(admin, scheduleId, date), MAPS_IN_ROTATION);
  if (!tie.tie) return;
  await admin
    .from("map_tiebreaker_rounds")
    .upsert(
      { ...match, round_number: 1, candidate_maps: tie.zone, slots: tie.slots },
      { onConflict: "schedule_id,event_date,round_number", ignoreDuplicates: true },
    );
}

/**
 * 'close' (idempotente): exige o voto de todos os classificados, a menos que `force`.
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
  if (!force && valid.length < classified.length) {
    return { ok: false, message: `Aguardando votos (${valid.length}/${classified.length}).` };
  }

  const tie = computeTie(
    countVotes(
      r.candidate_maps,
      valid.map((v) => v.maps as string[]),
    ),
    r.slots,
  );
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
export function finalMaps(main: Tally, rounds: RoundRow[], tiebreakerEnabled: boolean) {
  const tie = computeTie(main, MAPS_IN_ROTATION);
  if (!rounds.length) {
    // Desempate desligado: vale a ordem da apuração.
    if (!tie.tie || !tiebreakerEnabled) {
      return { maps: [...tie.guaranteed, ...tie.zone.slice(0, tie.slots)], random: [] as string[], pending: false };
    }
    return { maps: tie.guaranteed, random: [] as string[], pending: true };
  }
  const r1 = rounds.find((r) => r.round_number === 1);
  const r2 = rounds.find((r) => r.round_number === 2);
  const maps = [
    ...tie.guaranteed,
    ...(r1?.winning_maps ?? []),
    ...(r2?.winning_maps ?? []),
    ...(r2?.random_maps ?? []),
  ];
  const pending = rounds.some((r) => r.status === "voting");
  return { maps, random: r2?.random_maps ?? [], pending };
}
