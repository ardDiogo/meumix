"use server";

import { revalidatePath } from "next/cache";
import { canManageMixes } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { audit } from "@/services/audit";
import { getSession } from "@/services/auth";
import { BADGE_IMAGES } from "@/lib/badge-images";

export type BadgeResult = { ok: boolean; message: string };

const ICONS = new Set([
  "trophy",
  "crown",
  "medal",
  "award",
  "star",
  "flame",
  "zap",
  "target",
  "crosshair",
  "shield",
  "rocket",
  "gem",
  "heart",
  "skull",
  ...Object.keys(BADGE_IMAGES),
]);
const MIGRATION_HINT = "Rode a migração 0015_badges.sql no Supabase.";
const missing = (code?: string) => code === "42P01" || code === "PGRST205" || code === "42703";

async function requireAdmin() {
  const session = await getSession();
  if (!canManageMixes(session)) return { error: "Apenas administradores gerenciam insígnias." } as const;
  const admin = createSupabaseAdminClient();
  if (!admin) return { error: "O banco de dados não está configurado no servidor." } as const;
  return { session: session!, admin } as const;
}

function refresh() {
  revalidatePath("/", "layout");
}

export async function createBadge(input: {
  name: string;
  description: string;
  icon: string;
  color: string;
}): Promise<BadgeResult> {
  const auth = await requireAdmin();
  if ("error" in auth) return { ok: false, message: auth.error! };
  const name = input.name.trim().replace(/\s+/g, " ");
  const description = input.description.trim();
  if (name.length < 2 || name.length > 40) return { ok: false, message: "Nome: de 2 a 40 caracteres." };
  if (description.length > 200) return { ok: false, message: "Descrição: até 200 caracteres." };
  if (!ICONS.has(input.icon)) return { ok: false, message: "Ícone inválido." };
  if (!/^#[0-9a-f]{6}$/i.test(input.color)) return { ok: false, message: "Cor inválida." };
  const { error } = await auth.admin.from("badges").insert({
    name,
    description: description || null,
    icon: input.icon,
    color: input.color.toUpperCase(),
    created_by: auth.session.id,
  });
  if (error) {
    return {
      ok: false,
      message:
        error.code === "23505"
          ? "Já existe uma insígnia com esse nome."
          : missing(error.code)
            ? MIGRATION_HINT
            : "Não foi possível criar.",
    };
  }
  await audit({ action: "badge.create", outcome: "success", actorId: auth.session.id, detail: { name } });
  refresh();
  return { ok: true, message: `Insígnia "${name}" criada.` };
}

export async function deleteBadge(badgeId: string): Promise<BadgeResult> {
  const auth = await requireAdmin();
  if ("error" in auth) return { ok: false, message: auth.error! };
  const { data } = await auth.admin.from("badges").select("name").eq("id", badgeId).maybeSingle();
  const { error } = await auth.admin.from("badges").delete().eq("id", badgeId);
  if (error) return { ok: false, message: "Não foi possível excluir." };
  await audit({ action: "badge.delete", outcome: "success", actorId: auth.session.id, detail: { name: data?.name } });
  refresh();
  return { ok: true, message: "Insígnia excluída (e removida dos jogadores)." };
}

export async function grantBadge(badgeId: string, userIds: string[], note: string): Promise<BadgeResult> {
  const auth = await requireAdmin();
  if ("error" in auth) return { ok: false, message: auth.error! };
  const ids = [...new Set(userIds)].filter(Boolean);
  if (!ids.length) return { ok: false, message: "Escolha ao menos um jogador." };
  if (note.trim().length > 140) return { ok: false, message: "Observação: até 140 caracteres." };
  const { error } = await auth.admin.from("player_badges").upsert(
    ids.map((user_id) => ({
      user_id,
      badge_id: badgeId,
      note: note.trim() || null,
      assigned_by: auth.session.id,
    })),
    { onConflict: "user_id,badge_id", ignoreDuplicates: true },
  );
  if (error) return { ok: false, message: missing(error.code) ? MIGRATION_HINT : "Não foi possível conceder." };
  await audit({
    action: "badge.grant",
    outcome: "success",
    actorId: auth.session.id,
    detail: { badgeId, userIds: ids },
  });
  refresh();
  return {
    ok: true,
    message: ids.length > 1 ? `Insígnia concedida a ${ids.length} jogadores.` : "Insígnia concedida.",
  };
}

export async function revokeBadge(playerBadgeId: string): Promise<BadgeResult> {
  const auth = await requireAdmin();
  if ("error" in auth) return { ok: false, message: auth.error! };
  const { data } = await auth.admin
    .from("player_badges")
    .select("user_id, badge_id")
    .eq("id", playerBadgeId)
    .maybeSingle();
  const { error } = await auth.admin.from("player_badges").delete().eq("id", playerBadgeId);
  if (error) return { ok: false, message: "Não foi possível remover." };
  await audit({
    action: "badge.revoke",
    outcome: "success",
    actorId: auth.session.id,
    detail: { userId: data?.user_id, badgeId: data?.badge_id },
  });
  refresh();
  return { ok: true, message: "Insígnia removida do jogador." };
}
