"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { after } from "next/server";
import { canManageMixes } from "@/lib/auth/permissions";
import { currentOccurrence, registrationWindow } from "@/lib/mix-schedule";
import { captainsDecided, CAPTAIN_VOTES_PER_PLAYER, MAP_VOTES_PER_PLAYER } from "@/lib/mix-rules";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { audit } from "@/services/audit";
import { confirmLinkUser } from "@/services/confirm-links";
import { activePenalties } from "@/services/penalties";
import { getSession } from "@/services/auth";
import { notifyCaptains, notifyListFull } from "@/services/notify";
import { toSchedule, type ScheduleRow } from "@/services/mix-events";

/**
 * `code` permite à tela decidir se tenta de novo: só `error` (falha técnica)
 * entra na fila de nova tentativa; erros de regra não são repetidos.
 */
export type ActionResult =
  | { ok: true; message: string }
  | {
      ok: false;
      message: string;
      code?: "too_early" | "penalty" | "closed" | "unavailable" | "denied" | "invalid" | "error";
    };

const fail = (message: string, code?: Extract<ActionResult, { ok: false }>["code"]): ActionResult => ({
  ok: false,
  message,
  code,
});

/** Tolerância da abertura: recusa só se faltar mais de 1s (seção 2). */
const EARLY_TOLERANCE_MS = 1000;

function refresh() {
  revalidatePath("/dashboard");
  revalidatePath("/confirmar");
  revalidatePath("/admin");
}

/** Carrega a agenda e confirma que (agenda, data) é a ocorrência atual. */
async function loadOccurrence(scheduleId: string, date: string) {
  const admin = createSupabaseAdminClient();
  if (!admin) return { error: "Inscrições indisponíveis: servidor não configurado." } as const;
  const { data, error } = await admin
    .from("mix_schedules")
    .select("*")
    .eq("id", scheduleId)
    .eq("active", true)
    .maybeSingle();
  if (error) return { error: "Falha temporária ao consultar o mix.", retryable: true } as const;
  if (!data) return { error: "Este mix não está mais disponível." } as const;
  const schedule = toSchedule(data as ScheduleRow);
  const now = new Date();
  const occurrence = currentOccurrence(schedule, now);
  if (!occurrence || occurrence.date !== date) return { error: "Este mix não está mais disponível." } as const;
  return { admin, schedule, occurrence, now, window: registrationWindow(occurrence, now) } as const;
}

/** Lista os inscritos em ordem de chegada (para saber quem é classificado). */
async function orderedRegistrations(
  admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  scheduleId: string,
  date: string,
) {
  const { data } = await admin
    .from("mix_registrations")
    .select("user_id, created_at")
    .eq("schedule_id", scheduleId)
    .eq("event_date", date)
    .order("created_at", { ascending: true });
  return (data ?? []).map((r) => r.user_id as string);
}

/* ------------------------------- Inscrição ------------------------------- */

/** Inscreve o usuário logado no mix (seção 2). */
export async function joinMix(
  scheduleId: string,
  date: string,
  device?: string,
  clientTimestamp?: number,
): Promise<ActionResult> {
  // Logado, ou reconhecido pelo link pessoal de confirmação (sem login).
  const session = await getSession();
  const linked = session ? null : await confirmLinkUser();
  const userId = session?.id ?? linked?.id;
  if (!userId) return fail("Entre na sua conta para participar do mix.", "denied");
  const base = { action: "registration.join", actorId: userId, scheduleId, eventDate: date };
  // Dados da tentativa para o log (seção 1.2: inscription_audit_logs).
  const h = await headers();
  const serverTs = Date.now();
  const meta = {
    via: linked ? "personal_link" : "session",
    device: device ?? null,
    client_timestamp: Number.isFinite(clientTimestamp) ? new Date(clientTimestamp!).toISOString() : null,
    server_timestamp: new Date(serverTs).toISOString(),
    time_diff_ms: Number.isFinite(clientTimestamp) ? serverTs - clientTimestamp! : null,
    user_agent: h.get("user-agent")?.slice(0, 200) ?? null,
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null,
  };

  const ctx = await loadOccurrence(scheduleId, date);
  if ("error" in ctx) {
    await audit({ ...base, outcome: "error", detail: { ...meta, reason: ctx.error } });
    return fail(ctx.error!, "retryable" in ctx ? "error" : "unavailable");
  }

  // 1. Já inscrito → sucesso (não duplica).
  const { data: existing } = await ctx.admin
    .from("mix_registrations")
    .select("id")
    .eq("schedule_id", scheduleId)
    .eq("event_date", date)
    .eq("user_id", userId)
    .maybeSingle();
  if (existing) {
    await audit({ ...base, outcome: "already_registered", detail: meta });
    return { ok: true, message: "Você já está inscrito neste mix." };
  }

  // 2. Punição ativa: atraso a partir do horário de liberação (fail-open em erro).
  const penalty = (await activePenalties([userId])).get(userId);
  if (penalty) {
    const releaseAt = ctx.occurrence.opensAt.getTime() + penalty.delaySeconds * 1000;
    const remaining = releaseAt - ctx.now.getTime();
    if (remaining > 0) {
      await audit({
        ...base,
        outcome: "penalty",
        detail: { ...meta, penalty_id: penalty.id, seconds_remaining: Math.ceil(remaining / 1000) },
      });
      return fail(
        `Você está com uma punição ativa. Sua inscrição libera em ${Math.ceil(remaining / 1000)}s.`,
        "penalty",
      );
    }
  }

  // 3. Cedo demais (relógio do servidor, tolerância de 1s).
  const msToOpen = ctx.occurrence.opensAt.getTime() - ctx.now.getTime();
  if (msToOpen > EARLY_TOLERANCE_MS) {
    await audit({ ...base, outcome: "too_early", detail: { ...meta, ms_to_open: msToOpen } });
    return fail(`As inscrições abrem em ${Math.ceil(msToOpen / 1000)}s.`, "too_early");
  }
  if (ctx.window === "closed") {
    await audit({ ...base, outcome: "closed", detail: meta });
    return fail("As inscrições para este mix já foram encerradas.", "closed");
  }

  // 4. Cliques simultâneos: a chave única do banco impede duplicidade.
  const { error } = await ctx.admin.from("mix_registrations").insert({
    schedule_id: scheduleId,
    event_date: date,
    user_id: userId,
    device: device === "mobile" || device === "desktop" ? device : null,
  });
  if (error?.code === "23505") {
    await audit({ ...base, outcome: "already_registered", detail: meta });
    return { ok: true, message: "Você já está inscrito neste mix." };
  }
  if (error) {
    await audit({ ...base, outcome: "error", detail: { ...meta, code: error.code, message: error.message } });
    return fail("Falha temporária ao registrar a inscrição.", "error");
  }

  await audit({ ...base, outcome: "success", detail: meta });
  // Fechou a lista (10 classificados): chama todos para votar.
  const { count } = await ctx.admin
    .from("mix_registrations")
    .select("id", { count: "exact", head: true })
    .eq("schedule_id", scheduleId)
    .eq("event_date", date);
  if (count === ctx.schedule.maxPlayers) after(() => notifyListFull(scheduleId, date));
  refresh();
  return { ok: true, message: "Inscrição confirmada!" };
}

async function deleteRegistration(
  admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  filter: { id?: string; scheduleId?: string; date?: string; userId?: string },
  cancelledBy: string,
) {
  let query = admin.from("mix_registrations").select("id, schedule_id, event_date, user_id, created_at");
  if (filter.id) query = query.eq("id", filter.id);
  if (filter.scheduleId) query = query.eq("schedule_id", filter.scheduleId);
  if (filter.date) query = query.eq("event_date", filter.date);
  if (filter.userId) query = query.eq("user_id", filter.userId);
  const { data: reg } = await query.maybeSingle();
  if (!reg) return { found: false as const };

  const { error } = await admin.from("mix_registrations").delete().eq("id", reg.id);
  if (error) return { found: true as const, error };
  // Remover um jogador zera a escolha dos times (mantém os votos de capitão).
  await admin.from("mix_draft_state").delete().match({ schedule_id: reg.schedule_id, event_date: reg.event_date });
  // Times desfeitos: os palpites do bolão deixam de valer.
  await admin.from("mix_predictions").delete().match({ schedule_id: reg.schedule_id, event_date: reg.event_date });
  await admin.from("mix_cancellations").insert({
    schedule_id: reg.schedule_id,
    event_date: reg.event_date,
    user_id: reg.user_id,
    registered_at: reg.created_at,
    cancelled_by: cancelledBy,
  });
  return { found: true as const, reg };
}

/** Cancela a inscrição do usuário logado (até o início do mix). */
export async function leaveMix(scheduleId: string, date: string): Promise<ActionResult> {
  const session = await getSession();
  const userId = session?.id ?? (await confirmLinkUser())?.id;
  if (!userId) return fail("Entre na sua conta para gerenciar sua inscrição.", "denied");

  const ctx = await loadOccurrence(scheduleId, date);
  if ("error" in ctx) return fail(ctx.error!, "unavailable");
  if (ctx.window === "closed") return fail("O mix já começou; a inscrição não pode mais ser cancelada.", "closed");

  const result = await deleteRegistration(ctx.admin, { scheduleId, date, userId }, userId);
  if (result.found && "error" in result) return fail("Não foi possível cancelar a inscrição.", "error");
  await audit({ action: "registration.leave", outcome: "success", actorId: userId, scheduleId, eventDate: date });

  refresh();
  return { ok: true, message: "Inscrição cancelada." };
}

/** Admin: remove um inscrito. */
export async function removeRegistration(registrationId: string): Promise<ActionResult> {
  const session = await getSession();
  if (!canManageMixes(session)) return fail("Apenas administradores podem remover inscritos.", "denied");
  const admin = createSupabaseAdminClient();
  if (!admin) return fail("Servidor não configurado.", "unavailable");

  const result = await deleteRegistration(admin, { id: registrationId }, session!.id);
  if (result.found && "error" in result) return fail("Não foi possível remover o inscrito.", "error");
  await audit({
    action: "admin.remove_registration",
    outcome: "success",
    actorId: session!.id,
    scheduleId: result.found && "reg" in result ? result.reg!.schedule_id : null,
    eventDate: result.found && "reg" in result ? result.reg!.event_date : null,
    detail: { user_id: result.found && "reg" in result ? result.reg!.user_id : null },
  });
  refresh();
  return { ok: true, message: "Inscrito removido." };
}

/**
 * Super admin: inscreve um jogador cadastrado no mix atual (entra no fim da
 * lista, como uma inscrição normal). Passa por cima da janela de inscrição e
 * de punições, mas não depois do mix finalizado.
 */
export async function addPlayerToMix(scheduleId: string, date: string, userId: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session?.isSuperAdmin) return fail("Apenas o super admin pode incluir jogadores.", "denied");
  const ctx = await loadOccurrence(scheduleId, date);
  if ("error" in ctx) return fail(ctx.error!, "unavailable");

  const [{ data: profile }, { data: finalized }] = await Promise.all([
    ctx.admin.from("profiles").select("id, display_name").eq("id", userId).maybeSingle(),
    ctx.admin
      .from("mix_matches")
      .select("id")
      .match({ schedule_id: scheduleId, event_date: date })
      .limit(1)
      .maybeSingle(),
  ]);
  if (!profile) return fail("Jogador não encontrado.", "invalid");
  if (finalized) return fail("Este mix já foi finalizado.", "closed");
  const name = profile.display_name as string;

  const { error } = await ctx.admin
    .from("mix_registrations")
    .insert({ schedule_id: scheduleId, event_date: date, user_id: userId, device: null });
  if (error?.code === "23505") return { ok: true, message: `${name} já está na lista.` };
  if (error) return fail("Não foi possível incluir o jogador.", "error");

  await audit({
    action: "admin.add_registration",
    outcome: "success",
    actorId: session.id,
    scheduleId,
    eventDate: date,
    detail: { user_id: userId },
  });
  const { count } = await ctx.admin
    .from("mix_registrations")
    .select("id", { count: "exact", head: true })
    .match({ schedule_id: scheduleId, event_date: date });
  if (count === ctx.schedule.maxPlayers) after(() => notifyListFull(scheduleId, date));
  refresh();
  const reserve = (count ?? 0) > ctx.schedule.maxPlayers;
  return { ok: true, message: `${name} incluído na lista${reserve ? " como reserva" : ""}.` };
}

/** Admin: apaga todas as inscrições e votos da ocorrência atual. */
export async function resetRegistrations(scheduleId: string, date: string): Promise<ActionResult> {
  const session = await getSession();
  if (!canManageMixes(session)) return fail("Apenas administradores podem reiniciar o mix.", "denied");
  const admin = createSupabaseAdminClient();
  if (!admin) return fail("Servidor não configurado.", "unavailable");

  const match = { schedule_id: scheduleId, event_date: date };
  const draft = await admin.from("mix_draft_state").delete().match(match);
  if (draft.error) return fail("Não foi possível reiniciar o mix.", "error");
  // Times desfeitos: os palpites do bolão deixam de valer.
  await admin.from("mix_predictions").delete().match(match);
  const results = await Promise.all([
    admin.from("mix_registrations").delete().match(match),
    admin.from("map_votes").delete().match(match),
    admin.from("captain_votes").delete().match(match),
    // Lista nova: o registro de saídas recomeça junto (o reinício fica no audit_log).
    admin.from("mix_cancellations").delete().match(match),
  ]);
  if (results.some((r) => r.error)) return fail("Não foi possível reiniciar o mix.", "error");
  await audit({ action: "admin.reset_mix", outcome: "success", actorId: session!.id, scheduleId, eventDate: date });
  refresh();
  return { ok: true, message: "Mix reiniciado: inscrições e votos apagados." };
}

/* -------------------------------- Votações ------------------------------- */

async function requireClassifiedVoter(scheduleId: string, date: string) {
  const session = await getSession();
  if (!session) return { error: fail("Entre na sua conta para votar.", "denied") } as const;
  const ctx = await loadOccurrence(scheduleId, date);
  if ("error" in ctx) return { error: fail(ctx.error!, "unavailable") } as const;
  const order = await orderedRegistrations(ctx.admin, scheduleId, date);
  const classified = order.slice(0, ctx.schedule.maxPlayers);
  if (!classified.includes(session.id)) {
    return { error: fail("Só jogadores classificados podem votar.", "denied") } as const;
  }
  return { session, ctx, classified } as const;
}

/** Vota em exatamente 4 mapas ativos; substitui o voto anterior (seção 3). */
export async function submitMapVotes(scheduleId: string, date: string, mapIds: string[]): Promise<ActionResult> {
  const v = await requireClassifiedVoter(scheduleId, date);
  if ("error" in v) return v.error!;
  const unique = [...new Set(mapIds)];
  if (unique.length !== MAP_VOTES_PER_PLAYER) {
    return fail(`Escolha exatamente ${MAP_VOTES_PER_PLAYER} mapas.`, "invalid");
  }
  const { data: active } = await v.ctx.admin.from("maps").select("id").eq("active", true).in("id", unique);
  if ((active ?? []).length !== unique.length) return fail("Algum mapa escolhido não está disponível.", "invalid");

  const match = { schedule_id: scheduleId, event_date: date, user_id: v.session.id };
  const del = await v.ctx.admin.from("map_votes").delete().match(match);
  const ins = del.error
    ? del
    : await v.ctx.admin.from("map_votes").insert(unique.map((map_id) => ({ ...match, map_id })));
  if (ins.error) return fail("Não foi possível registrar seu voto.", "error");

  await audit({
    action: "vote.maps",
    outcome: "success",
    actorId: v.session.id,
    scheduleId,
    eventDate: date,
    detail: { maps: unique },
  });
  refresh();
  return { ok: true, message: "Voto de mapas registrado!" };
}

/** Vota em até 2 capitães classificados, nunca em si mesmo (seção 4). */
export async function submitCaptainVotes(
  scheduleId: string,
  date: string,
  candidateIds: string[],
): Promise<ActionResult> {
  const v = await requireClassifiedVoter(scheduleId, date);
  if ("error" in v) return v.error!;
  const unique = [...new Set(candidateIds)];
  if (!unique.length || unique.length > CAPTAIN_VOTES_PER_PLAYER) {
    return fail(`Escolha 1 ou ${CAPTAIN_VOTES_PER_PLAYER} capitães.`, "invalid");
  }
  if (unique.includes(v.session.id)) return fail("Você não pode votar em si mesmo.", "invalid");
  if (unique.some((id) => !v.classified.includes(id)))
    return fail("Só é possível votar em jogadores classificados.", "invalid");

  const occurrence = { schedule_id: scheduleId, event_date: date };
  const { data: draft } = await v.ctx.admin.from("mix_draft_state").select("status").match(occurrence).maybeSingle();
  if (draft) return fail("A seleção de equipes já começou: os votos de capitão estão encerrados.", "closed");

  const match = { ...occurrence, voter_id: v.session.id };
  const del = await v.ctx.admin.from("captain_votes").delete().match(match);
  const ins = del.error
    ? del
    : await v.ctx.admin.from("captain_votes").insert(unique.map((candidate_id) => ({ ...match, candidate_id })));
  if (ins.error) return fail("Não foi possível registrar seu voto.", "error");

  await audit({
    action: "vote.captains",
    outcome: "success",
    actorId: v.session.id,
    scheduleId,
    eventDate: date,
    detail: { candidates: unique },
  });

  // Todos os classificados votaram nos 2 capitães: a disputa começa sozinha.
  if (v.classified.length >= v.ctx.schedule.maxPlayers) {
    const { data: votes } = await v.ctx.admin.from("captain_votes").select("voter_id, candidate_id").match(occurrence);
    const cast = (votes ?? []).filter((x) => v.classified.includes(x.voter_id as string)).length;
    // Começa antes se o 2º colocado já não pode ser alcançado (seção 4).
    const decided = captainsDecided(
      v.classified,
      (votes ?? []).map((x) => ({ voter: x.voter_id as string, candidate: x.candidate_id as string })),
    );
    // Com sugestão de times ainda em votação, espera o resultado dela.
    const { data: pending } = await v.ctx.admin
      .from("mix_team_suggestions")
      .select("status")
      .match(occurrence)
      .eq("status", "pending")
      .maybeSingle();
    if ((cast >= v.ctx.schedule.maxPlayers * CAPTAIN_VOTES_PER_PLAYER || decided) && !pending) {
      const { error } = await v.ctx.admin.rpc("draft_start", { p_schedule: scheduleId, p_date: date });
      if (!error) after(() => notifyCaptains(scheduleId, date));
    }
  }
  refresh();
  return { ok: true, message: "Voto de capitães registrado!" };
}
