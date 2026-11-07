"use server";

import { revalidatePath } from "next/cache";
import { canManageChampionship } from "@/lib/championship";
import {
  formatWhen,
  freeServer,
  fromLocal,
  inWindow,
  roundRobin,
  scheduleProblem,
  type Booking,
} from "@/lib/championship-schedule";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { audit } from "@/services/audit";
import { getSession } from "@/services/auth";
import { syncChampionshipStatus } from "@/services/championship-guard";
import { MATCH_COLUMNS, toMatch, type MatchRow } from "@/services/championships";

export type ScheduleResult = { ok: boolean; message: string };

const MIGRATION = "Rode a migração 0040_championship_matches.sql no Supabase.";
const missing = (code?: string) => code === "42P01" || code === "PGRST205" || code === "42703" || code === "PGRST204";
const validId = (id: string) => /^[0-9a-f-]{36}$/i.test(id);
/** Jogos que ocupam horário e servidor. */
const FIRM = new Set(["approval", "scheduled", "live"]);

function refresh() {
  revalidatePath("/campeonatos", "layout");
}

async function load(championshipId: string) {
  const session = await getSession();
  const admin = createSupabaseAdminClient();
  if (!session) return { error: "Entre na sua conta." } as const;
  if (!admin || !validId(championshipId)) return { error: "Não foi possível salvar." } as const;
  const [ch, orgs, teams, draft, matches] = await Promise.all([
    admin
      .from("championships")
      .select("id, created_by, group_format, group_best_of, match_days, window_start, window_end, servers, status")
      .eq("id", championshipId)
      .maybeSingle(),
    admin.from("championship_organizers").select("user_id").eq("championship_id", championshipId),
    admin
      .from("championship_teams")
      .select("id, name, captain_id, created_at")
      .eq("championship_id", championshipId)
      .order("created_at"),
    admin.from("championship_drafts").select("status").eq("championship_id", championshipId).maybeSingle(),
    admin.from("championship_matches").select(MATCH_COLUMNS).eq("championship_id", championshipId),
  ]);
  if (matches.error) return { error: missing(matches.error.code) ? MIGRATION : "Não foi possível salvar." } as const;
  if (!ch.data) return { error: "Campeonato não encontrado." } as const;
  const c = ch.data;
  const teamList = (teams.data ?? []).map((t) => ({
    id: t.id as string,
    name: t.name as string,
    captainId: (t.captain_id as string | null) ?? null,
  }));
  return {
    session,
    admin,
    isManager: canManageChampionship(
      session,
      { createdBy: c.created_by as string | null },
      (orgs.data ?? []).map((o) => o.user_id as string),
    ),
    ch: {
      id: c.id as string,
      groupFormat: c.group_format as string,
      groupBestOf: Number(c.group_best_of),
      matchDays: ((c.match_days as number[]) ?? []).map(Number),
      windowStart: String(c.window_start).slice(0, 5),
      windowEnd: String(c.window_end).slice(0, 5),
      servers: Number(c.servers),
      status: c.status as string,
    },
    teams: teamList,
    names: Object.fromEntries(teamList.map((t) => [t.id, t.name])) as Record<string, string>,
    draftStatus: (draft.data?.status as string | undefined) ?? null,
    matches: (matches.data ?? []).map(toMatch),
  } as const;
}

type Loaded = Exclude<Awaited<ReturnType<typeof load>>, { error: string }>;

const booking = (m: MatchRow, startsAt: string, server: number | null = m.server): Booking => ({
  id: m.id,
  home: m.homeTeam,
  away: m.awayTeam,
  startsAt,
  bestOf: m.bestOf,
  server,
});
const firmBookings = (r: Loaded) =>
  r.matches.filter((m) => FIRM.has(m.status) && m.scheduledAt).map((m) => booking(m, m.scheduledAt!));

/** Times do jogo de que o usuário é capitão. */
const captainSide = (r: Loaded, m: MatchRow) =>
  [m.homeTeam, m.awayTeam].find((id) => id && r.teams.find((t) => t.id === id)?.captainId === r.session.id) ?? null;

function findMatch(r: Loaded, matchId: string) {
  return validId(matchId) ? (r.matches.find((m) => m.id === matchId) ?? null) : null;
}

async function setMatch(r: Loaded, matchId: string, patch: Record<string, unknown>) {
  return r.admin
    .from("championship_matches")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", matchId);
}

/* ------------------------------- Organização ------------------------------ */

/**
 * Gera os confrontos da fase classificatória (todos contra todos) depois do
 * draft. Pode gerar de novo enquanto nenhum jogo foi marcado.
 */
export async function generateMatches(championshipId: string): Promise<ScheduleResult> {
  const r = await load(championshipId);
  if ("error" in r) return { ok: false, message: r.error ?? "" };
  if (!r.isManager) return { ok: false, message: "Só quem organiza gera os confrontos." };
  // Por código não há draft: basta ter todos os times criados.
  const { data: full } = await r.admin.from("championships").select("*").eq("id", championshipId).maybeSingle();
  const byCode = (full as { team_mode?: string } | null)?.team_mode === "code";
  if (!byCode && r.draftStatus !== "done")
    return { ok: false, message: "Conclua o draft antes de gerar os confrontos." };
  const teamCount = Number((full as { team_count?: number } | null)?.team_count ?? r.teams.length);
  if (byCode && r.teams.length < teamCount)
    return {
      ok: false,
      message: `Crie os ${teamCount} times antes de gerar os confrontos (${r.teams.length} de ${teamCount}).`,
    };
  if (r.teams.length < 2) return { ok: false, message: "São precisos ao menos 2 times." };
  const group = r.matches.filter((m) => m.stage === "group");
  if (group.some((m) => m.status !== "pending"))
    return { ok: false, message: "Já há jogos marcados: edite o calendário em vez de gerar de novo." };
  if (group.length)
    await r.admin.from("championship_matches").delete().eq("championship_id", championshipId).eq("stage", "group");
  const fixtures = roundRobin(
    r.teams.map((t) => t.id),
    r.ch.groupFormat === "double_round_robin",
  );
  const singleRounds = Math.max(...roundRobin(r.teams.map((t) => t.id)).map((f) => f.round));
  const { error } = await r.admin.from("championship_matches").insert(
    fixtures.map((f) => ({
      championship_id: championshipId,
      stage: "group",
      round: f.round,
      leg: f.round > singleRounds ? 2 : 1,
      home_team: f.home,
      away_team: f.away,
      best_of: r.ch.groupBestOf,
    })),
  );
  if (error) return { ok: false, message: missing(error.code) ? MIGRATION : "Não foi possível gerar os confrontos." };
  await audit({
    action: "championship.matches_generate",
    outcome: "success",
    actorId: r.session.id,
    detail: { championshipId, matches: fixtures.length },
  });
  refresh();
  return { ok: true, message: `${fixtures.length} confrontos gerados.` };
}

/** Edita o calendário: muda a rodada e/ou inverte o mando (só jogos não finalizados). */
export async function editMatch(
  championshipId: string,
  matchId: string,
  input: { round: number; swap: boolean },
): Promise<ScheduleResult> {
  const r = await load(championshipId);
  if ("error" in r) return { ok: false, message: r.error ?? "" };
  if (!r.isManager) return { ok: false, message: "Só quem organiza edita o calendário." };
  const m = findMatch(r, matchId);
  if (!m) return { ok: false, message: "Jogo não encontrado." };
  if (m.status === "finished") return { ok: false, message: "Jogo finalizado não muda." };
  if (!(Number.isInteger(input.round) && input.round >= 1 && input.round <= 60))
    return { ok: false, message: "Rodada inválida." };
  const busy = r.matches.find(
    (o) =>
      o.id !== m.id &&
      o.stage === m.stage &&
      o.round === input.round &&
      [o.homeTeam, o.awayTeam].some((t) => t && (t === m.homeTeam || t === m.awayTeam)),
  );
  if (busy) {
    const t = [busy.homeTeam, busy.awayTeam].find((x) => x === m.homeTeam || x === m.awayTeam)!;
    return { ok: false, message: `O ${r.names[t]} já joga na rodada ${input.round}.` };
  }
  const { error } = await setMatch(r, matchId, {
    round: input.round,
    ...(input.swap ? { home_team: m.awayTeam, away_team: m.homeTeam } : {}),
  });
  if (error) return { ok: false, message: "Não foi possível salvar." };
  await audit({
    action: "championship.match_edit",
    outcome: "success",
    actorId: r.session.id,
    detail: { championshipId, matchId, round: input.round, swap: input.swap },
  });
  refresh();
  return { ok: true, message: "Calendário atualizado." };
}

/**
 * A organização marca direto (sem passar pelos capitães): fica Agendada. A
 * janela de dias/horários não é exigida aqui, mas time e servidor não podem chocar.
 */
export async function setSchedule(
  championshipId: string,
  matchId: string,
  local: string,
  server: number | null,
): Promise<ScheduleResult> {
  const r = await load(championshipId);
  if ("error" in r) return { ok: false, message: r.error ?? "" };
  if (!r.isManager) return { ok: false, message: "Só quem organiza marca direto." };
  const m = findMatch(r, matchId);
  if (!m) return { ok: false, message: "Jogo não encontrado." };
  if (m.status === "finished" || m.status === "live")
    return { ok: false, message: "Jogo já em andamento ou finalizado." };
  const startsAt = fromLocal(local);
  if (!startsAt) return { ok: false, message: "Data e hora inválidas." };
  if (server != null && !(Number.isInteger(server) && server >= 1 && server <= r.ch.servers))
    return { ok: false, message: "Servidor inválido." };
  const others = firmBookings(r);
  const srv = server ?? freeServer(booking(m, startsAt, null), others, r.ch.servers);
  const problem = scheduleProblem(booking(m, startsAt, srv), others, r.ch.servers, r.names);
  if (problem) return { ok: false, message: problem };
  await r.admin
    .from("championship_match_proposals")
    .update({ status: "superseded" })
    .eq("match_id", matchId)
    .eq("status", "pending");
  const { error } = await setMatch(r, matchId, { scheduled_at: startsAt, server: srv, status: "scheduled" });
  if (error) return { ok: false, message: "Não foi possível salvar." };
  await audit({
    action: "championship.match_schedule",
    outcome: "success",
    actorId: r.session.id,
    detail: { championshipId, matchId, startsAt, server: srv },
  });
  refresh();
  return { ok: true, message: `Agendado: ${formatWhen(startsAt)}, servidor ${srv}.` };
}

/** Aprova o horário combinado pelos capitães (servidor escolhido ou o primeiro livre). */
export async function approveSchedule(
  championshipId: string,
  matchId: string,
  server: number | null,
): Promise<ScheduleResult> {
  const r = await load(championshipId);
  if ("error" in r) return { ok: false, message: r.error ?? "" };
  if (!r.isManager) return { ok: false, message: "Só quem organiza aprova." };
  const m = findMatch(r, matchId);
  if (!m || m.status !== "approval" || !m.scheduledAt) return { ok: false, message: "Nada para aprovar neste jogo." };
  if (server != null && !(Number.isInteger(server) && server >= 1 && server <= r.ch.servers))
    return { ok: false, message: "Servidor inválido." };
  const others = firmBookings(r);
  const srv = server ?? freeServer(booking(m, m.scheduledAt, null), others, r.ch.servers);
  const problem = scheduleProblem(booking(m, m.scheduledAt, srv), others, r.ch.servers, r.names);
  if (problem) return { ok: false, message: problem };
  const { error } = await setMatch(r, matchId, { server: srv, status: "scheduled" });
  if (error) return { ok: false, message: "Não foi possível aprovar." };
  await audit({
    action: "championship.match_approve",
    outcome: "success",
    actorId: r.session.id,
    detail: { championshipId, matchId, server: srv },
  });
  refresh();
  return { ok: true, message: `Aprovado: ${formatWhen(m.scheduledAt)}, servidor ${srv}.` };
}

/**
 * Status manual da organização: Adiada, Cancelada ou de volta a Aguardando
 * agendamento (limpa data e servidor).
 */
export async function setMatchStatus(
  championshipId: string,
  matchId: string,
  status: "pending" | "postponed" | "cancelled",
): Promise<ScheduleResult> {
  const r = await load(championshipId);
  if ("error" in r) return { ok: false, message: r.error ?? "" };
  if (!r.isManager) return { ok: false, message: "Só quem organiza muda o status." };
  const m = findMatch(r, matchId);
  if (!m) return { ok: false, message: "Jogo não encontrado." };
  if (m.status === "finished") return { ok: false, message: "Jogo finalizado não muda." };
  if (!["pending", "postponed", "cancelled"].includes(status)) return { ok: false, message: "Status inválido." };
  await r.admin
    .from("championship_match_proposals")
    .update({ status: "cancelled" })
    .eq("match_id", matchId)
    .eq("status", "pending");
  const { error } = await setMatch(r, matchId, { status, scheduled_at: null, server: null });
  if (error) return { ok: false, message: "Não foi possível salvar." };
  // Cancelar o último jogo de um campeonato sem playoffs também pode encerrá-lo.
  await syncChampionshipStatus(r.admin, championshipId);
  await audit({
    action: "championship.match_status",
    outcome: "success",
    actorId: r.session.id,
    detail: { championshipId, matchId, status },
  });
  refresh();
  return {
    ok: true,
    message:
      status === "postponed"
        ? "Jogo adiado."
        : status === "cancelled"
          ? "Jogo cancelado."
          : "Jogo reaberto para agendamento.",
  };
}

/* -------------------------------- Capitães -------------------------------- */

/**
 * Capitão propõe data e hora (dentro dos dias e horários do campeonato). Uma
 * proposta nova substitui a anterior em aberto.
 */
export async function proposeDate(
  championshipId: string,
  matchId: string,
  local: string,
  note = "",
): Promise<ScheduleResult> {
  const r = await load(championshipId);
  if ("error" in r) return { ok: false, message: r.error ?? "" };
  const m = findMatch(r, matchId);
  if (!m || !m.homeTeam || !m.awayTeam) return { ok: false, message: "Jogo não encontrado." };
  const side = captainSide(r, m);
  if (!side) return { ok: false, message: "Só os capitães dos dois times propõem a data." };
  if (!["pending", "proposed", "postponed"].includes(m.status))
    return { ok: false, message: "Este jogo já tem data combinada." };
  const startsAt = fromLocal(local);
  if (!startsAt) return { ok: false, message: "Data e hora inválidas." };
  if (new Date(startsAt).getTime() < Date.now()) return { ok: false, message: "Escolha uma data futura." };
  if (!inWindow(startsAt, r.ch.matchDays, r.ch.windowStart, r.ch.windowEnd))
    return { ok: false, message: "Fora dos dias e horários permitidos para os jogos." };
  const problem = scheduleProblem(booking(m, startsAt, null), firmBookings(r), r.ch.servers, r.names);
  if (problem) return { ok: false, message: problem };

  await r.admin
    .from("championship_match_proposals")
    .update({ status: "superseded" })
    .eq("match_id", matchId)
    .eq("status", "pending");
  const { error } = await r.admin.from("championship_match_proposals").insert({
    match_id: matchId,
    championship_id: championshipId,
    proposed_by_team: side,
    proposed_by: r.session.id,
    starts_at: startsAt,
    note: note.trim().slice(0, 200),
  });
  if (error) return { ok: false, message: missing(error.code) ? MIGRATION : "Não foi possível enviar a proposta." };
  await setMatch(r, matchId, { status: "proposed" });
  await audit({
    action: "championship.match_propose",
    outcome: "success",
    actorId: r.session.id,
    detail: { championshipId, matchId, startsAt },
  });
  refresh();
  const other = side === m.homeTeam ? m.awayTeam : m.homeTeam;
  return { ok: true, message: `Proposta enviada ao capitão do ${r.names[other]}.` };
}

/**
 * Capitão adversário responde. Aceitar leva o jogo para a aprovação da
 * organização; recusar devolve para Aguardando agendamento.
 */
export async function respondProposal(
  championshipId: string,
  proposalId: string,
  accept: boolean,
): Promise<ScheduleResult> {
  const r = await load(championshipId);
  if ("error" in r) return { ok: false, message: r.error ?? "" };
  if (!validId(proposalId)) return { ok: false, message: "Proposta inválida." };
  const { data: p } = await r.admin
    .from("championship_match_proposals")
    .select("id, match_id, proposed_by_team, starts_at, status")
    .eq("id", proposalId)
    .eq("championship_id", championshipId)
    .maybeSingle();
  if (!p || p.status !== "pending") return { ok: false, message: "Essa proposta não está mais em aberto." };
  const m = findMatch(r, p.match_id as string);
  if (!m) return { ok: false, message: "Jogo não encontrado." };
  const side = captainSide(r, m);
  if (!side || side === p.proposed_by_team)
    return { ok: false, message: "Quem responde é o capitão do time adversário." };
  const startsAt = p.starts_at as string;
  if (accept) {
    if (new Date(startsAt).getTime() < Date.now())
      return { ok: false, message: "Esse horário já passou: proponha outro." };
    const problem = scheduleProblem(booking(m, startsAt, null), firmBookings(r), r.ch.servers, r.names);
    if (problem) return { ok: false, message: `${problem} Proponha outro horário.` };
  }
  const { data: changed } = await r.admin
    .from("championship_match_proposals")
    .update({
      status: accept ? "accepted" : "declined",
      responded_by: r.session.id,
      responded_at: new Date().toISOString(),
    })
    .eq("id", proposalId)
    .eq("status", "pending")
    .select("id");
  if (!changed?.length) return { ok: false, message: "Essa proposta não está mais em aberto." };
  await setMatch(r, m.id, accept ? { status: "approval", scheduled_at: startsAt } : { status: "pending" });
  await audit({
    action: accept ? "championship.match_accept" : "championship.match_decline",
    outcome: "success",
    actorId: r.session.id,
    detail: { championshipId, matchId: m.id, startsAt },
  });
  refresh();
  return {
    ok: true,
    message: accept
      ? "Data aceita: agora falta a aprovação da organização."
      : "Proposta recusada. Proponha outra data.",
  };
}

/** Quem propôs (ou a organização) retira a proposta em aberto. */
export async function cancelProposal(championshipId: string, proposalId: string): Promise<ScheduleResult> {
  const r = await load(championshipId);
  if ("error" in r) return { ok: false, message: r.error ?? "" };
  if (!validId(proposalId)) return { ok: false, message: "Proposta inválida." };
  const { data: p } = await r.admin
    .from("championship_match_proposals")
    .select("id, match_id, proposed_by_team, status")
    .eq("id", proposalId)
    .eq("championship_id", championshipId)
    .maybeSingle();
  if (!p || p.status !== "pending") return { ok: false, message: "Essa proposta não está mais em aberto." };
  const m = findMatch(r, p.match_id as string);
  if (!m) return { ok: false, message: "Jogo não encontrado." };
  if (!r.isManager && captainSide(r, m) !== p.proposed_by_team)
    return { ok: false, message: "Só quem propôs pode retirar a proposta." };
  await r.admin.from("championship_match_proposals").update({ status: "cancelled" }).eq("id", proposalId);
  await setMatch(r, m.id, { status: "pending" });
  refresh();
  return { ok: true, message: "Proposta retirada." };
}
