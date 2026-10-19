"use server";

import { revalidatePath } from "next/cache";
import { canManageMixes } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { audit } from "@/services/audit";
import { getSession } from "@/services/auth";
import { BADGE_IMAGES } from "@/lib/badge-images";
import { BADGE_RULES, type BadgeRule } from "@/lib/badge-engine";
import { recomputeBadges } from "@/services/badge-sync";

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
  unlock?: string;
  icon: string;
  color: string;
}): Promise<BadgeResult> {
  const auth = await requireAdmin();
  if ("error" in auth) return { ok: false, message: auth.error! };
  const name = input.name.trim().replace(/\s+/g, " ");
  const description = input.description.trim();
  if (name.length < 2 || name.length > 40) return { ok: false, message: "Nome: de 2 a 40 caracteres." };
  if (description.length > 200) return { ok: false, message: "Descrição: até 200 caracteres." };
  const unlock = (input.unlock ?? "").trim();
  if (unlock.length > 200) return { ok: false, message: "Desbloqueio: até 200 caracteres." };
  if (!ICONS.has(input.icon)) return { ok: false, message: "Ícone inválido." };
  if (!/^#[0-9a-f]{6}$/i.test(input.color)) return { ok: false, message: "Cor inválida." };
  const { error } = await auth.admin.from("badges").insert({
    name,
    description: description || null,
    icon: input.icon,
    color: input.color.toUpperCase(),
    created_by: auth.session.id,
    // Só envia a coluna quando preenchida (ela vem da migração 0021).
    ...(unlock ? { unlock_rule: unlock } : {}),
  });
  if (error) {
    return {
      ok: false,
      message:
        error.code === "23505"
          ? "Já existe uma insígnia com esse nome."
          : missing(error.code)
            ? unlock
              ? "Rode a migração 0021_badges_more.sql no Supabase para salvar o desbloqueio."
              : MIGRATION_HINT
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
  const { data: badge } = await auth.admin.from("badges").select("*").eq("id", badgeId).maybeSingle();
  if (!badge) return { ok: false, message: "Insígnia não encontrada." };
  // Automática concedida à mão: fica como conquista manual (o recálculo não mexe nela).
  const { error } = await auth.admin.from("player_badges").upsert(
    ids.map((user_id) => ({
      user_id,
      badge_id: badgeId,
      source: "manual",
      source_ref: "manual",
      note: note.trim() || null,
      assigned_by: auth.session.id,
    })),
    { onConflict: "user_id,badge_id,source_ref", ignoreDuplicates: true },
  );
  if (error) {
    return {
      ok: false,
      message:
        missing(error.code) || error.code === "42P10"
          ? "Rode a migração 0025_badges_auto.sql no Supabase."
          : "Não foi possível conceder.",
    };
  }
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
  const { data } = await auth.admin.from("player_badges").select("*").eq("id", playerBadgeId).maybeSingle();
  if (data?.source === "auto") {
    return { ok: false, message: "Conquista automática: ela sai sozinha quando o jogador deixa de cumprir a regra." };
  }
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

/** Habilita ou desabilita uma insígnia sem apagar o histórico de conquistas. */
export async function setBadgeEnabled(badgeId: string, enabled: boolean): Promise<BadgeResult> {
  const auth = await requireAdmin();
  if ("error" in auth) return { ok: false, message: auth.error! };
  const { data: badge, error } = await auth.admin
    .from("badges")
    .update({ enabled })
    .eq("id", badgeId)
    .select("name, auto_rule")
    .maybeSingle();
  if (error)
    return {
      ok: false,
      message: missing(error.code) ? "Rode a migração 0025_badges_auto.sql no Supabase." : "Não foi possível salvar.",
    };
  if (!badge) return { ok: false, message: "Insígnia não encontrada." };
  await audit({
    action: enabled ? "badge.enable" : "badge.disable",
    outcome: "success",
    actorId: auth.session.id,
    detail: { name: badge.name },
  });
  // Ao reabilitar uma automática, recalcula quem tem agora.
  if (enabled && badge.auto_rule) await recomputeBadges();
  refresh();
  return {
    ok: true,
    message: enabled ? `"${badge.name}" habilitada.` : `"${badge.name}" desabilitada (histórico mantido).`,
  };
}

/** Ajusta os parâmetros de uma insígnia automática (ex.: mínimo de mixes do Rei do Mix) e recalcula. */
export async function updateBadgeParams(badgeId: string, params: Record<string, number>): Promise<BadgeResult> {
  const auth = await requireAdmin();
  if ("error" in auth) return { ok: false, message: auth.error! };
  const { data: badge } = await auth.admin.from("badges").select("name, auto_rule").eq("id", badgeId).maybeSingle();
  const rule = badge?.auto_rule as BadgeRule | undefined;
  if (!badge || !rule || !(rule in BADGE_RULES))
    return { ok: false, message: "Só insígnias automáticas têm parâmetros." };
  const clean: Record<string, number> = {};
  for (const key of Object.keys(BADGE_RULES[rule].defaults)) {
    const v = Number(params[key]);
    if (!Number.isFinite(v) || v <= 0 || v > 1000) return { ok: false, message: `Valor inválido em "${key}".` };
    clean[key] = key === "min_rating" ? Math.round(v * 100) / 100 : Math.round(v);
  }
  const { error } = await auth.admin.from("badges").update({ params: clean }).eq("id", badgeId);
  if (error) return { ok: false, message: "Não foi possível salvar." };
  await audit({
    action: "badge.params",
    outcome: "success",
    actorId: auth.session.id,
    detail: { name: badge.name, params: clean },
  });
  const r = await recomputeBadges();
  refresh();
  return r.ok
    ? { ok: true, message: `Parâmetros salvos e insígnias recalculadas.` }
    : { ok: false, message: `Parâmetros salvos, mas o recálculo falhou: ${r.message}` };
}

/** Recalcula agora todas as insígnias automáticas. */
export async function recomputeBadgesNow(): Promise<BadgeResult> {
  const auth = await requireAdmin();
  if ("error" in auth) return { ok: false, message: auth.error! };
  const r = await recomputeBadges();
  if (!r.ok) return { ok: false, message: r.message };
  await audit({
    action: "badge.recompute",
    outcome: "success",
    actorId: auth.session.id,
    detail: { inseridas: r.inseridas, atualizadas: r.atualizadas, removidas: r.removidas },
  });
  refresh();
  return {
    ok: true,
    message: `Insígnias recalculadas: ${r.inseridas} nova(s), ${r.atualizadas} atualizada(s), ${r.removidas} removida(s) por correção.`,
  };
}

/**
 * Desativa ou reativa a conquista de um jogador. Automática desativada fica
 * travada (o recálculo não reativa); ao reativar, volta a seguir a regra.
 */
export async function setPlayerBadgeActive(playerBadgeId: string, active: boolean): Promise<BadgeResult> {
  const auth = await requireAdmin();
  if ("error" in auth) return { ok: false, message: auth.error! };
  const { data: row } = await auth.admin
    .from("player_badges")
    .select("user_id, badge_id, source")
    .eq("id", playerBadgeId)
    .maybeSingle();
  if (!row) return { ok: false, message: "Conquista não encontrada." };
  const { error } = await auth.admin
    .from("player_badges")
    .update(
      active
        ? { deactivated_at: null, end_reason: null, locked: false }
        : { deactivated_at: new Date().toISOString(), end_reason: "Desativada pelo admin", locked: true },
    )
    .eq("id", playerBadgeId);
  if (error) {
    return {
      ok: false,
      message: missing(error.code) ? "Rode a migração 0025_badges_auto.sql no Supabase." : "Não foi possível salvar.",
    };
  }
  await audit({
    action: active ? "badge.reactivate" : "badge.deactivate",
    outcome: "success",
    actorId: auth.session.id,
    detail: { userId: row.user_id, badgeId: row.badge_id },
  });
  // Reativada: o cálculo confere se o jogador ainda cumpre a regra.
  let stillActive = true;
  if (active && row.source === "auto") {
    await recomputeBadges();
    const { data: after } = await auth.admin
      .from("player_badges")
      .select("deactivated_at")
      .eq("id", playerBadgeId)
      .maybeSingle();
    stillActive = !!after && !after.deactivated_at;
  }
  refresh();
  if (!active) return { ok: true, message: "Insígnia desativada para o jogador (o recálculo não reativa)." };
  return stillActive
    ? { ok: true, message: "Insígnia reativada." }
    : {
        ok: true,
        message:
          "Reativada, mas o jogador não cumpre mais a regra e o recálculo a encerrou. Para manter mesmo assim, conceda manualmente.",
      };
}
