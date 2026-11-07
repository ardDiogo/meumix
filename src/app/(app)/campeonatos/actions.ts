"use server";

import { revalidatePath } from "next/cache";
import {
  canCreateChampionship,
  championshipSlug,
  validateChampionship,
  type ChampionshipInput,
  missingColumn,
} from "@/lib/championship";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { audit } from "@/services/audit";
import { getSession } from "@/services/auth";
import { requireOrganizer } from "@/services/championship-guard";

export type ChampionshipResult = { ok: boolean; message: string; slug?: string };

import { MIGRATION, missing } from "@/lib/championship";

const MODE_MIGRATION = "Para times por código, rode a migração 0044_championship_codes.sql no Supabase.";
const validId = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

function refresh() {
  revalidatePath("/campeonatos", "layout");
}

/** Capa: JPEG em base64 vindo do navegador (já reduzido). */
const bannerOk = (b: string) => /^[A-Za-z0-9+/=]+$/.test(b) && b.length <= 1_400_000;

function toRow(i: ChampionshipInput) {
  return {
    name: i.name.trim(),
    description: i.description.trim(),
    edition: i.edition.trim(),
    starts_on: i.startsOn || null,
    ends_on: i.endsOn || null,
    team_count: i.teamCount,
    players_per_team: i.playersPerTeam,
    pot_count: i.potCount,
    group_format: i.groupFormat,
    group_best_of: i.groupBestOf,
    points_win: i.pointsWin,
    points_loss: i.pointsLoss,
    playoff_format: i.playoffFormat,
    playoff_best_of: i.playoffBestOf,
    match_days: [...new Set(i.matchDays)].sort(),
    window_start: i.windowStart,
    window_end: i.windowEnd,
    servers: i.servers,
    entry_fee: i.entryFee,
    prize_split: i.prizeSplit,
    costs: i.costs,
    status: i.status,
    ...(i.banner === undefined ? {} : { banner: i.banner }),
  };
}

/** Cria o campeonato (administradores). Quem cria passa a organizar. */
export async function createChampionship(input: ChampionshipInput): Promise<ChampionshipResult> {
  const session = await getSession();
  if (!canCreateChampionship(session)) return { ok: false, message: "Apenas administradores criam campeonatos." };
  const errors = validateChampionship(input);
  if (errors.length) return { ok: false, message: errors[0]! };
  if (input.banner && !bannerOk(input.banner))
    return { ok: false, message: "Imagem de capa inválida ou grande demais." };
  const admin = createSupabaseAdminClient();
  if (!admin) return { ok: false, message: "O banco de dados não está configurado no servidor." };

  // Endereço único: "copa-meumix", "copa-meumix-2"…
  const base = championshipSlug(input.name, input.edition);
  const { data: taken, error: takenError } = await admin.from("championships").select("slug").like("slug", `${base}%`);
  if (takenError) return { ok: false, message: missing(takenError.code) ? MIGRATION : "Não foi possível criar." };
  const used = new Set((taken ?? []).map((t) => t.slug as string));
  let slug = base;
  for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`;

  let { error } = await admin
    .from("championships")
    .insert({ ...toRow(input), team_mode: input.teamMode, slug, created_by: session!.id });
  // Sem a migração 0044: campeonato de draft ainda pode ser criado; por código, não.
  if (missingColumn(error?.code)) {
    if (input.teamMode === "code") return { ok: false, message: MODE_MIGRATION };
    ({ error } = await admin.from("championships").insert({ ...toRow(input), slug, created_by: session!.id }));
  }
  if (error) {
    console.error("[campeonato] criar:", error.code, error.message);
    return {
      ok: false,
      message: missing(error.code)
        ? MIGRATION
        : `Não foi possível criar o campeonato (erro ${error.code ?? "desconhecido"}).`,
    };
  }
  await audit({ action: "championship.create", outcome: "success", actorId: session!.id, detail: { slug } });
  refresh();
  return { ok: true, message: "Campeonato criado.", slug };
}

export async function updateChampionship(id: string, input: ChampionshipInput): Promise<ChampionshipResult> {
  const r = await requireOrganizer(id);
  if ("error" in r) return { ok: false, message: r.error! };
  const errors = validateChampionship(input);
  if (errors.length) return { ok: false, message: errors[0]! };
  if (input.banner && !bannerOk(input.banner))
    return { ok: false, message: "Imagem de capa inválida ou grande demais." };
  // Trocar a formação das equipes só antes de começar (sem draft e sem confrontos).
  const { data: current } = await r.admin.from("championships").select("*").eq("id", id).maybeSingle();
  const currentMode = (current as { team_mode?: string } | null)?.team_mode ?? "draft";
  if (currentMode !== input.teamMode) {
    const [{ data: draft }, { count: games }] = await Promise.all([
      r.admin.from("championship_drafts").select("status").eq("championship_id", id).maybeSingle(),
      r.admin.from("championship_matches").select("id", { count: "exact", head: true }).eq("championship_id", id),
    ]);
    if (draft || games)
      return { ok: false, message: "A formação das equipes só muda antes do draft e dos confrontos." };
  }
  let { error } = await r.admin
    .from("championships")
    .update({ ...toRow(input), team_mode: input.teamMode, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (missingColumn(error?.code)) {
    if (input.teamMode === "code") return { ok: false, message: MODE_MIGRATION };
    ({ error } = await r.admin
      .from("championships")
      .update({ ...toRow(input), updated_at: new Date().toISOString() })
      .eq("id", id));
  }
  if (error) {
    console.error("[campeonato] salvar:", error.code, error.message);
    return { ok: false, message: `Não foi possível salvar (erro ${error.code ?? "desconhecido"}).` };
  }
  await audit({
    action: "championship.update",
    outcome: "success",
    actorId: r.session.id,
    detail: { slug: r.ch.slug, status: input.status },
  });
  refresh();
  return { ok: true, message: "Campeonato salvo.", slug: r.ch.slug };
}

/** Libera alguém para organizar (só o super admin). */
export async function setOrganizer(id: string, userId: string, on: boolean): Promise<ChampionshipResult> {
  const session = await getSession();
  if (!session?.isSuperAdmin) return { ok: false, message: "Só o super admin libera organizadores." };
  const admin = createSupabaseAdminClient();
  if (!admin || !validId(id) || !validId(userId)) return { ok: false, message: "Não foi possível salvar." };
  const { error } = on
    ? await admin
        .from("championship_organizers")
        .upsert(
          { championship_id: id, user_id: userId, granted_by: session.id },
          { onConflict: "championship_id,user_id" },
        )
    : await admin.from("championship_organizers").delete().eq("championship_id", id).eq("user_id", userId);
  if (error) return { ok: false, message: missing(error.code) ? MIGRATION : "Não foi possível salvar." };
  await audit({
    action: on ? "championship.organizer_add" : "championship.organizer_remove",
    outcome: "success",
    actorId: session.id,
    detail: { championshipId: id, userId },
  });
  refresh();
  return { ok: true, message: on ? "Organizador liberado." : "Organizador removido." };
}

/** Exclui o campeonato e tudo dele (quem criou ou o super admin). */
export async function deleteChampionship(id: string): Promise<ChampionshipResult> {
  const r = await requireOrganizer(id);
  if ("error" in r) return { ok: false, message: r.error! };
  if (!r.session.isSuperAdmin && r.ch.createdBy !== r.session.id)
    return { ok: false, message: "Só quem criou o campeonato (ou o super admin) pode excluí-lo." };
  const { error } = await r.admin.from("championships").delete().eq("id", id);
  if (error) return { ok: false, message: "Não foi possível excluir." };
  await audit({
    action: "championship.delete",
    outcome: "success",
    actorId: r.session.id,
    detail: { slug: r.ch.slug },
  });
  refresh();
  return { ok: true, message: "Campeonato excluído." };
}

/** Número de inscrições pagas (controle manual). Vazio volta a usar o número de inscritos. */
export async function setPaidPlayers(id: string, paid: number | null): Promise<ChampionshipResult> {
  const r = await requireOrganizer(id);
  if ("error" in r) return { ok: false, message: r.error ?? "Não foi possível salvar." };
  if (paid != null && !(Number.isInteger(paid) && paid >= 0 && paid <= 1000))
    return { ok: false, message: "Número de pagantes inválido." };
  const { error } = await r.admin.from("championships").update({ paid_players: paid }).eq("id", id);
  if (error)
    return {
      ok: false,
      message: missingColumn(error.code)
        ? "Rode a migração 0042_championship_paid.sql no Supabase."
        : "Não foi possível salvar.",
    };
  await audit({
    action: "championship.paid",
    outcome: "success",
    actorId: r.session.id,
    detail: { championshipId: id, paid },
  });
  refresh();
  return { ok: true, message: paid == null ? "Usando o número de inscritos." : `${paid} inscrições pagas.` };
}
