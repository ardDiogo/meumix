"use server";

import { revalidatePath } from "next/cache";
import { randomInt } from "node:crypto";
import { generateJoinCode, MIGRATION, missing, validateTeam, type TeamInput, missingColumn } from "@/lib/championship";
import { audit } from "@/services/audit";
import { requireOrganizer, teamModeOf } from "@/services/championship-guard";

export type TeamResult = { ok: boolean; message: string };

const validId = (id: string) => /^[0-9a-f-]{36}$/i.test(id);
const STARTED = new Set(["running", "playoffs", "finished"]);
const logoOk = (b: string) => /^[A-Za-z0-9+/=]+$/.test(b) && b.length <= 380_000;

/** Sorteio seguro para o código (0 ≤ n < 1). */
const randomUnit = () => randomInt(1_000_000) / 1_000_000;

function refresh() {
  revalidatePath("/campeonatos", "layout");
}

/** Organizador e campeonato que ainda aceita mudanças no elenco. */
async function guard(championshipId: string) {
  const r = await requireOrganizer(championshipId);
  if ("error" in r) return { error: r.error! } as const;
  if (STARTED.has(r.ch.status)) return { error: "O campeonato já começou: inscritos e times estão fechados." } as const;
  // Com o draft em andamento (ou feito), inscritos, capitães e times ficam fechados.
  const { data: draft } = await r.admin
    .from("championship_drafts")
    .select("status")
    .eq("championship_id", championshipId)
    .maybeSingle();
  if (draft) return { error: "O draft já começou: reinicie o draft para mudar inscritos e times." } as const;
  return r;
}

/** Inscreve jogadores cadastrados (até completar as vagas). */
export async function addPlayers(championshipId: string, userIds: string[]): Promise<TeamResult> {
  const r = await guard(championshipId);
  if ("error" in r) return { ok: false, message: r.error ?? "Não foi possível salvar." };
  const ids = [...new Set(userIds)].filter(validId);
  if (!ids.length) return { ok: false, message: "Escolha ao menos um jogador." };
  const [{ data: profiles }, { data: current, error }] = await Promise.all([
    r.admin.from("profiles").select("id").in("id", ids),
    r.admin.from("championship_players").select("user_id").eq("championship_id", championshipId),
  ]);
  if (error) return { ok: false, message: missing(error.code) ? MIGRATION : "Não foi possível salvar." };
  const already = new Set((current ?? []).map((p) => p.user_id as string));
  const fresh = (profiles ?? []).map((p) => p.id as string).filter((id) => !already.has(id));
  if (!fresh.length) return { ok: false, message: "Esses jogadores já estão inscritos." };
  const vagas = r.ch.teamCount * r.ch.playersPerTeam - already.size;
  if (fresh.length > vagas)
    return {
      ok: false,
      message: vagas > 0 ? `Só restam ${vagas} vagas.` : "Todas as vagas já estão preenchidas.",
    };
  const { error: insertError } = await r.admin.from("championship_players").upsert(
    fresh.map((user_id) => ({ championship_id: championshipId, user_id })),
    { onConflict: "championship_id,user_id", ignoreDuplicates: true },
  );
  if (insertError) return { ok: false, message: "Não foi possível inscrever." };
  await audit({
    action: "championship.players_add",
    outcome: "success",
    actorId: r.session.id,
    detail: { championshipId, count: fresh.length },
  });
  refresh();
  return { ok: true, message: fresh.length === 1 ? "Jogador inscrito." : `${fresh.length} jogadores inscritos.` };
}

/** Tira um inscrito (o capitão precisa ser trocado antes). */
export async function removePlayer(championshipId: string, userId: string): Promise<TeamResult> {
  const r = await guard(championshipId);
  if ("error" in r) return { ok: false, message: r.error ?? "Não foi possível salvar." };
  if (!validId(userId)) return { ok: false, message: "Jogador inválido." };
  const { data: captainOf } = await r.admin
    .from("championship_teams")
    .select("name")
    .eq("championship_id", championshipId)
    .eq("captain_id", userId)
    .maybeSingle();
  if (captainOf) return { ok: false, message: `É capitão do ${captainOf.name}: troque o capitão antes.` };
  const { error } = await r.admin
    .from("championship_players")
    .delete()
    .eq("championship_id", championshipId)
    .eq("user_id", userId);
  if (error) return { ok: false, message: "Não foi possível remover." };
  await audit({
    action: "championship.player_remove",
    outcome: "success",
    actorId: r.session.id,
    detail: { championshipId, userId },
  });
  refresh();
  return { ok: true, message: "Inscrição removida." };
}

/**
 * Cria ou edita um time. O capitão precisa estar inscrito e não ser capitão de
 * outro time; ele entra no time na hora (é um dos jogadores, fora dos potes).
 */
export async function saveTeam(championshipId: string, teamId: string | null, input: TeamInput): Promise<TeamResult> {
  const r = await guard(championshipId);
  if ("error" in r) return { ok: false, message: r.error ?? "Não foi possível salvar." };
  const errors = validateTeam(input);
  if (errors.length) return { ok: false, message: errors[0]! };
  if (teamId && !validId(teamId)) return { ok: false, message: "Time inválido." };
  const mode = await teamModeOf(r.admin, championshipId);
  if (input.logo && !logoOk(input.logo)) return { ok: false, message: "Escudo inválido ou grande demais." };
  const captain = input.captainId && validId(input.captainId) ? input.captainId : null;

  const [{ data: teams, error }, { data: players }] = await Promise.all([
    r.admin.from("championship_teams").select("id, name, captain_id").eq("championship_id", championshipId),
    r.admin.from("championship_players").select("user_id, team_id").eq("championship_id", championshipId),
  ]);
  if (error) return { ok: false, message: missing(error.code) ? MIGRATION : "Não foi possível salvar." };
  const current = teamId ? teams?.find((t) => t.id === teamId) : null;
  if (teamId && !current) return { ok: false, message: "Time não encontrado." };
  if (!teamId && (teams?.length ?? 0) >= r.ch.teamCount)
    return { ok: false, message: `O campeonato tem ${r.ch.teamCount} times.` };
  const name = input.name.trim();
  if (teams?.some((t) => t.id !== teamId && (t.name as string).toLowerCase() === name.toLowerCase()))
    return { ok: false, message: "Já existe um time com esse nome." };
  if (captain) {
    if (!players?.some((p) => p.user_id === captain))
      return { ok: false, message: "O capitão precisa estar inscrito." };
    const other = teams?.find((t) => t.id !== teamId && t.captain_id === captain);
    if (other) return { ok: false, message: `Esse jogador já é capitão do ${other.name}.` };
    const elsewhere = players?.find((p) => p.user_id === captain && p.team_id && p.team_id !== teamId);
    if (elsewhere) return { ok: false, message: "Esse jogador já está em outro time." };
    if (mode === "code" && !players?.some((p) => p.user_id === captain && p.team_id === teamId))
      return { ok: false, message: "O capitão precisa estar no time (entrou pelo código)." };
  }

  const row = {
    name,
    tag: input.tag.trim().toUpperCase(),
    color: input.color.toUpperCase(),
    captain_id: captain,
    ...(input.logo === undefined ? {} : { logo: input.logo }),
  };
  let id = teamId;
  if (teamId) {
    const { error: e } = await r.admin.from("championship_teams").update(row).eq("id", teamId);
    if (e) return { ok: false, message: "Não foi possível salvar o time." };
  } else {
    // Todo time nasce com o código de entrada (sem a migração 0044, sem código).
    const insert = (withCode: boolean) =>
      r.admin
        .from("championship_teams")
        .insert({
          ...row,
          championship_id: championshipId,
          ...(withCode ? { join_code: generateJoinCode(randomUnit) } : {}),
        })
        .select("id")
        .single();
    let { data, error: e } = await insert(true);
    if (e?.code === "23505" && /code/.test(e.message ?? "")) ({ data, error: e } = await insert(true));
    if (missingColumn(e?.code)) ({ data, error: e } = await insert(false));
    if (e || !data) return { ok: false, message: "Não foi possível criar o time." };
    id = data.id as string;
  }
  // Capitão antigo sai do time; o novo entra. (Por código, o antigo continua jogando no time.)
  const oldCaptain = (current?.captain_id as string | null) ?? null;
  if (oldCaptain && oldCaptain !== captain && mode !== "code")
    await r.admin
      .from("championship_players")
      .update({ team_id: null })
      .eq("championship_id", championshipId)
      .eq("user_id", oldCaptain);
  if (captain)
    await r.admin
      .from("championship_players")
      .update({ team_id: id, pot: null })
      .eq("championship_id", championshipId)
      .eq("user_id", captain);

  await audit({
    action: teamId ? "championship.team_update" : "championship.team_create",
    outcome: "success",
    actorId: r.session.id,
    detail: { championshipId, teamId: id, name, captain },
  });
  refresh();
  return { ok: true, message: teamId ? "Time salvo." : "Time criado." };
}

/** Exclui um time (os jogadores dele voltam a ficar sem time). */
export async function deleteTeam(championshipId: string, teamId: string): Promise<TeamResult> {
  const r = await guard(championshipId);
  if ("error" in r) return { ok: false, message: r.error ?? "Não foi possível salvar." };
  if (!validId(teamId)) return { ok: false, message: "Time inválido." };
  await r.admin
    .from("championship_players")
    .update({ team_id: null })
    .eq("championship_id", championshipId)
    .eq("team_id", teamId);
  const { error } = await r.admin
    .from("championship_teams")
    .delete()
    .eq("championship_id", championshipId)
    .eq("id", teamId);
  if (error) return { ok: false, message: "Não foi possível excluir o time." };
  await audit({
    action: "championship.team_delete",
    outcome: "success",
    actorId: r.session.id,
    detail: { championshipId, teamId },
  });
  refresh();
  return { ok: true, message: "Time excluído." };
}
