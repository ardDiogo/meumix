"use server";

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { generateJoinCode, normalizeCode, missingColumn } from "@/lib/championship";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { audit } from "@/services/audit";
import { getSession } from "@/services/auth";
import { requireOrganizer, teamModeOf } from "@/services/championship-guard";

export type CodeResult = { ok: boolean; message: string };

const MODE_MIGRATION = "Rode a migração 0044_championship_codes.sql no Supabase.";
const validId = (id: string) => /^[0-9a-f-]{36}$/i.test(id);
const randomUnit = () => randomInt(1_000_000) / 1_000_000;
/** Depois que o campeonato começa (ou é cancelado), ninguém entra nem sai de time. */
const CLOSED = new Set(["running", "playoffs", "finished", "cancelled"]);

function refresh() {
  revalidatePath("/campeonatos", "layout");
}

/** Campeonato por código, ainda aberto, com o tamanho dos times. */
async function openChampionship(admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>, id: string) {
  const { data } = await admin.from("championships").select("*").eq("id", id).maybeSingle();
  if (!data) return { error: "Campeonato não encontrado." } as const;
  const c = data as Record<string, unknown>;
  if (c.team_mode !== "code") return { error: "Este campeonato forma os times por draft." } as const;
  if (CLOSED.has(c.status as string)) return { error: "O campeonato já começou: os times estão fechados." } as const;
  return { playersPerTeam: Number(c.players_per_team) } as const;
}

/**
 * Entrar no time pelo código. Quem entra fica inscrito e já no time; o
 * primeiro a entrar num time sem capitão vira o capitão.
 */
export async function joinTeamByCode(championshipId: string, rawCode: string): Promise<CodeResult> {
  const session = await getSession();
  if (!session) return { ok: false, message: "Entre na sua conta para usar o código." };
  const admin = createSupabaseAdminClient();
  if (!admin || !validId(championshipId)) return { ok: false, message: "Não foi possível entrar." };
  const ch = await openChampionship(admin, championshipId);
  if ("error" in ch) return { ok: false, message: ch.error ?? "" };
  const code = normalizeCode(rawCode);
  if (code.length !== 6) return { ok: false, message: "O código tem 6 letras e números." };

  const { data: team, error } = await admin
    .from("championship_teams")
    .select("id, name, captain_id")
    .eq("championship_id", championshipId)
    .eq("join_code", code)
    .maybeSingle();
  if (error) return { ok: false, message: missingColumn(error.code) ? MODE_MIGRATION : "Não foi possível entrar." };
  if (!team) return { ok: false, message: "Código não encontrado neste campeonato." };

  const { data: rows } = await admin
    .from("championship_players")
    .select("user_id, team_id")
    .eq("championship_id", championshipId);
  const mine = (rows ?? []).find((p) => p.user_id === session.id);
  if (mine?.team_id === team.id) return { ok: true, message: `Você já está no ${team.name}.` };
  if (mine?.team_id) return { ok: false, message: "Você já está em outro time. Saia dele antes de entrar neste." };
  const members = (rows ?? []).filter((p) => p.team_id === team.id).length;
  if (members >= ch.playersPerTeam) return { ok: false, message: `O ${team.name} já está completo.` };

  const { error: joinError } = await admin
    .from("championship_players")
    .upsert(
      { championship_id: championshipId, user_id: session.id, team_id: team.id, pot: null },
      { onConflict: "championship_id,user_id" },
    );
  if (joinError) return { ok: false, message: "Não foi possível entrar no time." };
  let captain = false;
  if (!team.captain_id) {
    const { data: set } = await admin
      .from("championship_teams")
      .update({ captain_id: session.id })
      .eq("id", team.id)
      .is("captain_id", null)
      .select("id");
    captain = !!set?.length;
  }
  await audit({
    action: "championship.team_join",
    outcome: "success",
    actorId: session.id,
    detail: { championshipId, teamId: team.id, captain },
  });
  refresh();
  return { ok: true, message: captain ? `Você entrou no ${team.name} como capitão.` : `Você entrou no ${team.name}.` };
}

/** Sair do próprio time (e do campeonato) antes de começar. Capitão que sai deixa o time sem capitão. */
export async function leaveTeam(championshipId: string): Promise<CodeResult> {
  const session = await getSession();
  const admin = createSupabaseAdminClient();
  if (!session || !admin || !validId(championshipId)) return { ok: false, message: "Não foi possível sair." };
  const ch = await openChampionship(admin, championshipId);
  if ("error" in ch) return { ok: false, message: ch.error ?? "" };
  await admin
    .from("championship_teams")
    .update({ captain_id: null })
    .eq("championship_id", championshipId)
    .eq("captain_id", session.id);
  const { error } = await admin
    .from("championship_players")
    .delete()
    .eq("championship_id", championshipId)
    .eq("user_id", session.id);
  if (error) return { ok: false, message: "Não foi possível sair." };
  await audit({
    action: "championship.team_leave",
    outcome: "success",
    actorId: session.id,
    detail: { championshipId },
  });
  refresh();
  return { ok: true, message: "Você saiu do time." };
}

/** Novo código para o time (o antigo deixa de valer). Organização. */
export async function regenerateTeamCode(championshipId: string, teamId: string): Promise<CodeResult> {
  const r = await requireOrganizer(championshipId);
  if ("error" in r) return { ok: false, message: r.error ?? "Não foi possível salvar." };
  if (!validId(teamId)) return { ok: false, message: "Time inválido." };
  for (let attempt = 0; attempt < 3; attempt++) {
    const { error } = await r.admin
      .from("championship_teams")
      .update({ join_code: generateJoinCode(randomUnit) })
      .eq("id", teamId)
      .eq("championship_id", championshipId);
    if (!error) {
      refresh();
      return { ok: true, message: "Código novo gerado. O anterior não vale mais." };
    }
    if (missingColumn(error.code)) return { ok: false, message: MODE_MIGRATION };
  }
  return { ok: false, message: "Não foi possível gerar o código." };
}

/**
 * Organização coloca, troca ou tira um inscrito de um time (campeonato por
 * código). Tirar o capitão deixa o time sem capitão.
 */
export async function setPlayerTeam(
  championshipId: string,
  userId: string,
  teamId: string | null,
): Promise<CodeResult> {
  const r = await requireOrganizer(championshipId);
  if ("error" in r) return { ok: false, message: r.error ?? "Não foi possível salvar." };
  if (!validId(userId) || (teamId && !validId(teamId))) return { ok: false, message: "Dados inválidos." };
  if ((await teamModeOf(r.admin, championshipId)) !== "code")
    return { ok: false, message: "Neste campeonato os times saem do draft." };
  if (CLOSED.has(r.ch.status)) return { ok: false, message: "O campeonato já começou: os times estão fechados." };
  const [{ data: rows }, { data: teams }] = await Promise.all([
    r.admin.from("championship_players").select("user_id, team_id").eq("championship_id", championshipId),
    r.admin.from("championship_teams").select("id, name, captain_id").eq("championship_id", championshipId),
  ]);
  if (!(rows ?? []).some((p) => p.user_id === userId)) return { ok: false, message: "Jogador não inscrito." };
  const team = teamId ? (teams ?? []).find((t) => t.id === teamId) : null;
  if (teamId && !team) return { ok: false, message: "Time não encontrado." };
  if (team && (rows ?? []).filter((p) => p.team_id === team.id && p.user_id !== userId).length >= r.ch.playersPerTeam)
    return { ok: false, message: `O ${team.name} já está completo.` };
  // Era capitão de outro time: esse time fica sem capitão.
  await r.admin
    .from("championship_teams")
    .update({ captain_id: null })
    .eq("championship_id", championshipId)
    .eq("captain_id", userId)
    .neq("id", teamId ?? "00000000-0000-0000-0000-000000000000");
  const { error } = await r.admin
    .from("championship_players")
    .update({ team_id: teamId, pot: null })
    .eq("championship_id", championshipId)
    .eq("user_id", userId);
  if (error) return { ok: false, message: "Não foi possível salvar." };
  refresh();
  return { ok: true, message: team ? `Movido para o ${team.name}.` : "Tirado do time." };
}
