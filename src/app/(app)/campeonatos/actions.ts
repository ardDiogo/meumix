"use server";

import { revalidatePath } from "next/cache";
import {
  canCreateChampionship,
  canManageChampionship,
  championshipSlug,
  validateChampionship,
  type ChampionshipInput,
} from "@/lib/championship";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { audit } from "@/services/audit";
import { getSession } from "@/services/auth";

export type ChampionshipResult = { ok: boolean; message: string; slug?: string };

const MIGRATION = "Rode a migração 0038_championships.sql no Supabase.";
const missing = (code?: string) => code === "42P01" || code === "PGRST205" || code === "42703";
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

/** Quem pode organizar este campeonato (criador, liberados, super admin). */
async function requireOrganizer(id: string) {
  const session = await getSession();
  const admin = createSupabaseAdminClient();
  if (!session || !admin || !validId(id)) return { error: "Não foi possível salvar." } as const;
  const [{ data: ch, error }, { data: orgs }] = await Promise.all([
    admin.from("championships").select("id, slug, created_by").eq("id", id).maybeSingle(),
    admin.from("championship_organizers").select("user_id").eq("championship_id", id),
  ]);
  if (error) return { error: missing(error.code) ? MIGRATION : "Não foi possível salvar." } as const;
  if (!ch) return { error: "Campeonato não encontrado." } as const;
  const ok = canManageChampionship(
    session,
    { createdBy: ch.created_by as string | null },
    (orgs ?? []).map((o) => o.user_id as string),
  );
  if (!ok) return { error: "Só quem organiza este campeonato pode alterá-lo." } as const;
  return {
    session,
    admin,
    ch: { id: ch.id as string, slug: ch.slug as string, createdBy: ch.created_by as string | null },
  } as const;
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

  const { error } = await admin.from("championships").insert({ ...toRow(input), slug, created_by: session!.id });
  if (error) return { ok: false, message: missing(error.code) ? MIGRATION : "Não foi possível criar o campeonato." };
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
  const { error } = await r.admin
    .from("championships")
    .update({ ...toRow(input), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, message: "Não foi possível salvar." };
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
