"use server";

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { canManageChampionship, rosterIssues, type ChampionshipTeam } from "@/lib/championship";
import { draftProgress, potIssues, resolveAdedonha } from "@/lib/championship-draft";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { audit } from "@/services/audit";
import { getSession } from "@/services/auth";

export type DraftResult = { ok: boolean; message: string };

const MIGRATION = "Rode a migração 0039_championship_draft.sql no Supabase.";
const missing = (code?: string) => code === "42P01" || code === "PGRST205" || code === "42703";
const validId = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

function refresh() {
  revalidatePath("/campeonatos", "layout");
}

/**
 * Carrega tudo o que o draft precisa e quem está agindo: organizador e/ou
 * capitão de algum time. Só o servidor grava (cliente admin).
 */
async function load(championshipId: string) {
  const session = await getSession();
  const admin = createSupabaseAdminClient();
  if (!session) return { error: "Entre na sua conta." } as const;
  if (!admin || !validId(championshipId)) return { error: "Não foi possível salvar." } as const;
  const [ch, orgs, teams, players, draft, rounds, picks] = await Promise.all([
    admin
      .from("championships")
      .select("id, slug, created_by, team_count, players_per_team, pot_count, status")
      .eq("id", championshipId)
      .maybeSingle(),
    admin.from("championship_organizers").select("user_id").eq("championship_id", championshipId),
    admin
      .from("championship_teams")
      .select("id, name, tag, color, captain_id, draft_order, created_at")
      .eq("championship_id", championshipId)
      .order("created_at"),
    admin.from("championship_players").select("user_id, pot, team_id").eq("championship_id", championshipId),
    admin.from("championship_drafts").select("status").eq("championship_id", championshipId).maybeSingle(),
    admin
      .from("championship_adedonha_rounds")
      .select("round, start_team, remaining, played, resolved_at")
      .eq("championship_id", championshipId)
      .order("round"),
    admin
      .from("championship_picks")
      .select("id, pick_no, pot, team_id, user_id")
      .eq("championship_id", championshipId)
      .is("undone_at", null)
      .order("pick_no"),
  ]);
  if (draft.error || rounds.error || picks.error)
    return {
      error: missing(draft.error?.code ?? rounds.error?.code ?? picks.error?.code)
        ? MIGRATION
        : "Não foi possível salvar.",
    } as const;
  if (!ch.data) return { error: "Campeonato não encontrado." } as const;
  const c = ch.data;
  const teamList = (teams.data ?? []).map((t): ChampionshipTeam => ({
    id: t.id as string,
    name: t.name as string,
    tag: (t.tag as string) ?? "",
    color: t.color as string,
    hasLogo: false,
    captainId: (t.captain_id as string | null) ?? null,
    draftOrder: (t.draft_order as number | null) ?? null,
  }));
  const isManager = canManageChampionship(
    session,
    { createdBy: c.created_by as string | null },
    (orgs.data ?? []).map((o) => o.user_id as string),
  );
  return {
    session,
    admin,
    isManager,
    ch: {
      id: c.id as string,
      slug: c.slug as string,
      teamCount: Number(c.team_count),
      playersPerTeam: Number(c.players_per_team),
      potCount: Number(c.pot_count),
      status: c.status as string,
    },
    teams: teamList,
    players: (players.data ?? []).map((p) => ({
      userId: p.user_id as string,
      pot: (p.pot as number | null) ?? null,
      teamId: (p.team_id as string | null) ?? null,
    })),
    draftStatus: (draft.data?.status as "order" | "picking" | "done" | undefined) ?? null,
    rounds: (rounds.data ?? []).map((r) => ({
      round: r.round as number,
      startTeam: r.start_team as string,
      remaining: (r.remaining as string[]) ?? [],
      played: (r.played as string[]) ?? [],
      resolved: !!r.resolved_at,
    })),
    picks: (picks.data ?? []).map((p) => ({
      id: p.id as string,
      pickNo: p.pick_no as number,
      pot: p.pot as number,
      teamId: p.team_id as string,
      userId: p.user_id as string,
    })),
  } as const;
}

type Loaded = Exclude<Awaited<ReturnType<typeof load>>, { error: string }>;

/** Ordem do draft já definida (draft_order 1..n). */
const orderOf = (teams: ChampionshipTeam[]) =>
  [...teams]
    .filter((t) => t.draftOrder != null)
    .sort((a, b) => a.draftOrder! - b.draftOrder!)
    .map((t) => t.id);

/* --------------------------------- Potes --------------------------------- */

/** Coloca (ou tira) um inscrito de um pote. Só antes do draft começar. */
export async function setPot(championshipId: string, userId: string, pot: number | null): Promise<DraftResult> {
  const r = await load(championshipId);
  if ("error" in r) return { ok: false, message: r.error ?? "" };
  if (!r.isManager) return { ok: false, message: "Só quem organiza monta os potes." };
  if (r.draftStatus) return { ok: false, message: "O draft já começou: os potes estão fechados." };
  if (pot != null && !(Number.isInteger(pot) && pot >= 1 && pot <= r.ch.potCount))
    return { ok: false, message: "Pote inválido." };
  if (!r.players.some((p) => p.userId === userId)) return { ok: false, message: "Jogador não inscrito." };
  if (r.teams.some((t) => t.captainId === userId)) return { ok: false, message: "Capitão não entra em pote." };
  if (pot != null && r.players.filter((p) => p.pot === pot && p.userId !== userId).length >= r.ch.teamCount)
    return { ok: false, message: `O pote ${pot} já tem ${r.ch.teamCount} jogadores.` };
  const { error } = await r.admin
    .from("championship_players")
    .update({ pot })
    .eq("championship_id", championshipId)
    .eq("user_id", userId);
  if (error) return { ok: false, message: "Não foi possível salvar." };
  refresh();
  return { ok: true, message: pot ? `Movido para o pote ${pot}.` : "Tirado do pote." };
}

/* ------------------------------- Adedonha -------------------------------- */

/** Nova rodada: os times ainda sem posição, com o começo da contagem sorteado. */
async function openRound(r: Loaded, round: number, remaining: string[]) {
  const start = remaining[randomInt(remaining.length)]!;
  return r.admin.from("championship_adedonha_rounds").insert({
    championship_id: r.ch.id,
    round,
    start_team: start,
    remaining,
  });
}

/**
 * Começa o draft: confere inscritos, capitães e potes e abre a 1ª rodada da
 * adedonha. A partir daqui inscritos, times e potes ficam fechados.
 */
export async function startDraft(championshipId: string): Promise<DraftResult> {
  const r = await load(championshipId);
  if ("error" in r) return { ok: false, message: r.error ?? "" };
  if (!r.isManager) return { ok: false, message: "Só quem organiza começa o draft." };
  if (r.draftStatus) return { ok: false, message: "O draft já começou." };
  const captains = new Set(r.teams.map((t) => t.captainId).filter((x): x is string => !!x));
  const issues = [
    ...rosterIssues(r.ch, r.teams, r.players),
    ...potIssues(r.players, captains, r.ch.potCount, r.ch.teamCount),
  ];
  if (issues.length) return { ok: false, message: issues[0]! };

  const { error } = await r.admin
    .from("championship_drafts")
    .insert({ championship_id: championshipId, status: "order", started_by: r.session.id });
  if (error)
    return { ok: false, message: error.code === "23505" ? "O draft já começou." : "Não foi possível começar." };
  // Limpa sobras de um draft reiniciado.
  await r.admin.from("championship_teams").update({ draft_order: null }).eq("championship_id", championshipId);
  const { error: roundError } = await openRound(
    r,
    1,
    r.teams.map((t) => t.id),
  );
  if (roundError) return { ok: false, message: "Não foi possível abrir a adedonha." };
  await audit({
    action: "championship.draft_start",
    outcome: "success",
    actorId: r.session.id,
    detail: { championshipId },
  });
  refresh();
  return { ok: true, message: "Draft iniciado: hora da adedonha!" };
}

/**
 * Jogada da adedonha (0 a 5). Quem joga é o capitão do time; quem organiza
 * pode jogar por um capitão ausente. Quando todos jogam, o servidor revela,
 * conta e define a próxima posição da ordem.
 */
export async function playAdedonha(championshipId: string, teamId: string, value: number): Promise<DraftResult> {
  const r = await load(championshipId);
  if ("error" in r) return { ok: false, message: r.error ?? "" };
  if (r.draftStatus !== "order") return { ok: false, message: "A adedonha não está aberta." };
  if (!(Number.isInteger(value) && value >= 0 && value <= 5)) return { ok: false, message: "Escolha de 0 a 5." };
  const team = r.teams.find((t) => t.id === teamId);
  if (!team) return { ok: false, message: "Time inválido." };
  if (team.captainId !== r.session.id && !r.isManager)
    return { ok: false, message: `Só o capitão do ${team.name} joga por ele.` };
  const round = r.rounds.find((x) => !x.resolved);
  if (!round) return { ok: false, message: "Nenhuma rodada aberta." };
  if (!round.remaining.includes(teamId)) return { ok: false, message: `O ${team.name} já tem posição na ordem.` };
  if (round.played.includes(teamId)) return { ok: false, message: `O ${team.name} já jogou nesta rodada.` };

  const { error } = await r.admin.from("championship_adedonha_moves").insert({
    championship_id: championshipId,
    round: round.round,
    team_id: teamId,
    value,
    played_by: r.session.id,
  });
  if (error)
    return { ok: false, message: error.code === "23505" ? `O ${team.name} já jogou.` : "Não foi possível jogar." };

  // Quem já jogou (lido das jogadas gravadas: duas jogadas ao mesmo tempo não se perdem).
  const { data: moves } = await r.admin
    .from("championship_adedonha_moves")
    .select("team_id, value")
    .eq("championship_id", championshipId)
    .eq("round", round.round);
  const played = (moves ?? []).map((m) => m.team_id as string);
  await r.admin
    .from("championship_adedonha_rounds")
    .update({ played })
    .eq("championship_id", championshipId)
    .eq("round", round.round)
    .is("resolved_at", null);

  if (round.remaining.every((id) => played.includes(id))) {
    const values = Object.fromEntries((moves ?? []).map((m) => [m.team_id as string, m.value as number]));
    const { total, picked } = resolveAdedonha(round.remaining, round.startTeam, values);
    // Resolve uma vez só (a última jogada de dois capitães ao mesmo tempo não conta duas vezes).
    const { data: resolved } = await r.admin
      .from("championship_adedonha_rounds")
      .update({ revealed: values, total, picked_team: picked, resolved_at: new Date().toISOString() })
      .eq("championship_id", championshipId)
      .eq("round", round.round)
      .is("resolved_at", null)
      .select("round");
    if (resolved?.length) {
      await r.admin.from("championship_teams").update({ draft_order: round.round }).eq("id", picked);
      const rest = round.remaining.filter((id) => id !== picked);
      if (rest.length === 1) {
        // O último que sobra fecha a ordem; começam as escolhas.
        await r.admin
          .from("championship_teams")
          .update({ draft_order: round.round + 1 })
          .eq("id", rest[0]!);
        await r.admin
          .from("championship_drafts")
          .update({ status: "picking", updated_at: new Date().toISOString() })
          .eq("championship_id", championshipId);
      } else await openRound(r, round.round + 1, rest);
      const name = r.teams.find((t) => t.id === picked)?.name ?? "";
      refresh();
      return { ok: true, message: `Total ${total}: o ${name} é o ${round.round}º a escolher.` };
    }
  }
  refresh();
  return { ok: true, message: "Jogada registrada. Esperando os outros capitães." };
}

/* -------------------------------- Escolhas ------------------------------- */

/**
 * Escolhe um jogador do pote da vez. Quem escolhe é o capitão do time da vez
 * (ou quem organiza). O índice único impede escolher duas vezes.
 */
export async function pickPlayer(championshipId: string, userId: string): Promise<DraftResult> {
  const r = await load(championshipId);
  if ("error" in r) return { ok: false, message: r.error ?? "" };
  if (r.draftStatus !== "picking") return { ok: false, message: "As escolhas não estão abertas." };
  const order = orderOf(r.teams);
  const { next, total } = draftProgress(order, r.ch.potCount, r.picks);
  if (!next) return { ok: false, message: "O draft já terminou." };
  const team = r.teams.find((t) => t.id === next.teamId)!;
  if (team.captainId !== r.session.id && !r.isManager)
    return { ok: false, message: `É a vez do ${team.name}: só o capitão dele escolhe.` };
  const player = r.players.find((p) => p.userId === userId);
  if (!player) return { ok: false, message: "Jogador não inscrito." };
  if (player.pot !== next.pot) return { ok: false, message: `Agora é a vez do pote ${next.pot}.` };
  if (r.picks.some((p) => p.userId === userId) || player.teamId)
    return { ok: false, message: "Esse jogador já foi escolhido." };

  const { error } = await r.admin.from("championship_picks").insert({
    championship_id: championshipId,
    pick_no: next.pickNo,
    pot: next.pot,
    team_id: team.id,
    user_id: userId,
    picked_by: r.session.id,
  });
  if (error)
    return {
      ok: false,
      message:
        error.code === "23505" ? "Essa escolha já foi feita. A tela vai atualizar." : "Não foi possível escolher.",
    };
  await r.admin
    .from("championship_players")
    .update({ team_id: team.id })
    .eq("championship_id", championshipId)
    .eq("user_id", userId);
  const last = next.pickNo === total;
  if (last)
    await r.admin
      .from("championship_drafts")
      .update({ status: "done", updated_at: new Date().toISOString() })
      .eq("championship_id", championshipId);
  await audit({
    action: "championship.draft_pick",
    outcome: "success",
    actorId: r.session.id,
    detail: { championshipId, pickNo: next.pickNo, teamId: team.id, userId },
  });
  refresh();
  return { ok: true, message: last ? "Draft concluído: elencos formados!" : "Escolha feita." };
}

/** Desfaz a última escolha (quem organiza). Fica no histórico como desfeita. */
export async function undoLastPick(championshipId: string): Promise<DraftResult> {
  const r = await load(championshipId);
  if ("error" in r) return { ok: false, message: r.error ?? "" };
  if (!r.isManager) return { ok: false, message: "Só quem organiza desfaz escolhas." };
  if (r.draftStatus !== "picking" && r.draftStatus !== "done") return { ok: false, message: "Não há escolhas." };
  const last = r.picks.at(-1);
  if (!last) return { ok: false, message: "Nenhuma escolha para desfazer." };
  const { data: undone } = await r.admin
    .from("championship_picks")
    .update({ undone_at: new Date().toISOString(), undone_by: r.session.id })
    .eq("id", last.id)
    .is("undone_at", null)
    .select("id");
  if (!undone?.length) return { ok: false, message: "Essa escolha já foi desfeita." };
  await r.admin
    .from("championship_players")
    .update({ team_id: null })
    .eq("championship_id", championshipId)
    .eq("user_id", last.userId);
  if (r.draftStatus === "done")
    await r.admin
      .from("championship_drafts")
      .update({ status: "picking", updated_at: new Date().toISOString() })
      .eq("championship_id", championshipId);
  await audit({
    action: "championship.draft_undo",
    outcome: "success",
    actorId: r.session.id,
    detail: { championshipId, pickNo: last.pickNo, userId: last.userId },
  });
  refresh();
  return { ok: true, message: `Escolha ${last.pickNo} desfeita.` };
}

/**
 * Reinicia o draft (quem organiza): ordem e escolhas voltam do zero; as
 * escolhas ficam no histórico como desfeitas. Potes e capitães são mantidos.
 */
export async function resetDraft(championshipId: string): Promise<DraftResult> {
  const r = await load(championshipId);
  if ("error" in r) return { ok: false, message: r.error ?? "" };
  if (!r.isManager) return { ok: false, message: "Só quem organiza reinicia o draft." };
  if (!r.draftStatus) return { ok: false, message: "O draft não começou." };
  if (["running", "playoffs", "finished"].includes(r.ch.status))
    return { ok: false, message: "O campeonato já começou." };
  const now = new Date().toISOString();
  await r.admin
    .from("championship_picks")
    .update({ undone_at: now, undone_by: r.session.id })
    .eq("championship_id", championshipId)
    .is("undone_at", null);
  const captains = r.teams.map((t) => t.captainId).filter((x): x is string => !!x);
  // Só os escolhidos saem dos times; os capitães continuam.
  const picked = r.players.filter((p) => p.teamId && !captains.includes(p.userId)).map((p) => p.userId);
  if (picked.length)
    await r.admin
      .from("championship_players")
      .update({ team_id: null })
      .eq("championship_id", championshipId)
      .in("user_id", picked);
  await r.admin.from("championship_teams").update({ draft_order: null }).eq("championship_id", championshipId);
  await r.admin.from("championship_adedonha_rounds").delete().eq("championship_id", championshipId);
  await r.admin.from("championship_drafts").delete().eq("championship_id", championshipId);
  await audit({
    action: "championship.draft_reset",
    outcome: "success",
    actorId: r.session.id,
    detail: { championshipId },
  });
  refresh();
  return { ok: true, message: "Draft reiniciado." };
}
