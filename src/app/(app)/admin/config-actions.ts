"use server";

import { revalidatePath } from "next/cache";
import { canManageAdmins, canManageMixes } from "@/lib/auth/permissions";
import { validateLevels, type LevelDef } from "@/lib/levels";
import { MAPS_IN_ROTATION } from "@/lib/mix-rules";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { audit } from "@/services/audit";
import { getSession } from "@/services/auth";

export interface ConfigResult {
  ok: boolean;
  message: string;
}

const MIGRATION_HINT = "Rode a migração 0010_admin_config.sql no Supabase para ativar esta configuração.";

async function requireAdmin(master = false) {
  const session = await getSession();
  const allowed = master ? canManageAdmins(session) : canManageMixes(session);
  if (!allowed) {
    return { error: master ? "Apenas o master pode alterar isto." : "Apenas administradores podem alterar isto." };
  }
  const admin = createSupabaseAdminClient();
  if (!admin) return { error: "O banco de dados não está configurado no servidor." };
  return { session: session!, admin };
}

function dbMessage(error: { code?: string; message?: string }, fallback = "Não foi possível salvar.") {
  if (error.code === "42703" || error.code === "42P01" || error.code === "PGRST202" || error.code === "PGRST205") {
    return MIGRATION_HINT;
  }
  return fallback;
}

function refreshAll() {
  revalidatePath("/", "layout");
}

/* --------------------------------- Mapas --------------------------------- */

const slug = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/^de[_\s-]+/, "")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 30);

export async function addMap(name: string, shortName: string): Promise<ConfigResult> {
  const auth = await requireAdmin();
  if ("error" in auth) return { ok: false, message: auth.error! };
  const cleanName = name.trim().replace(/\s+/g, " ");
  const cleanShort = shortName.trim().slice(0, 8);
  if (cleanName.length < 2 || cleanName.length > 30)
    return { ok: false, message: "Nome do mapa: de 2 a 30 caracteres." };
  const s = slug(cleanName);
  if (!s) return { ok: false, message: "Nome do mapa inválido." };
  const id = `de_${s}`;

  const { data: existing } = await auth.admin.from("maps").select("id, sort_order");
  if ((existing ?? []).some((m) => m.id === id)) return { ok: false, message: "Esse mapa já está cadastrado." };
  const sortOrder = Math.max(0, ...(existing ?? []).map((m) => (m.sort_order as number) ?? 0)) + 1;

  const { error } = await auth.admin
    .from("maps")
    .insert({ id, name: cleanName, short_name: cleanShort || null, active: true, sort_order: sortOrder });
  if (error) return { ok: false, message: dbMessage(error) };
  await audit({ action: "admin.map_add", outcome: "success", actorId: auth.session.id, detail: { id } });
  refreshAll();
  return { ok: true, message: `${cleanName} adicionado.` };
}

export async function setMapActive(id: string, active: boolean): Promise<ConfigResult> {
  const auth = await requireAdmin();
  if ("error" in auth) return { ok: false, message: auth.error! };
  if (!active) {
    const { data } = await auth.admin.from("maps").select("id").eq("active", true);
    const remaining = (data ?? []).filter((m) => m.id !== id).length;
    if (remaining < MAPS_IN_ROTATION) {
      return { ok: false, message: `Mantenha pelo menos ${MAPS_IN_ROTATION} mapas ativos para a votação.` };
    }
  }
  const { error } = await auth.admin.from("maps").update({ active }).eq("id", id);
  if (error) return { ok: false, message: dbMessage(error) };
  await audit({ action: "admin.map_toggle", outcome: "success", actorId: auth.session.id, detail: { id, active } });
  refreshAll();
  return { ok: true, message: active ? "Mapa ativado." : "Mapa desativado." };
}

export async function deleteMap(id: string): Promise<ConfigResult> {
  const auth = await requireAdmin();
  if ("error" in auth) return { ok: false, message: auth.error! };
  const { data } = await auth.admin.from("maps").select("id, active");
  const target = (data ?? []).find((m) => m.id === id);
  if (!target) return { ok: false, message: "Mapa não encontrado." };
  if (target.active && (data ?? []).filter((m) => m.active).length - 1 < MAPS_IN_ROTATION) {
    return { ok: false, message: `Mantenha pelo menos ${MAPS_IN_ROTATION} mapas ativos para a votação.` };
  }
  const { error } = await auth.admin.from("maps").delete().eq("id", id);
  if (error) {
    return {
      ok: false,
      message:
        error.code === "23503"
          ? "Esse mapa já foi usado em votações ou partidas. Desative-o em vez de excluir."
          : dbMessage(error, "Não foi possível excluir."),
    };
  }
  await audit({ action: "admin.map_delete", outcome: "success", actorId: auth.session.id, detail: { id } });
  refreshAll();
  return { ok: true, message: "Mapa excluído." };
}

export async function reorderMaps(ids: string[]): Promise<ConfigResult> {
  const auth = await requireAdmin();
  if ("error" in auth) return { ok: false, message: auth.error! };
  if (!ids.length || new Set(ids).size !== ids.length) return { ok: false, message: "Ordem inválida." };
  const results = await Promise.all(
    ids.map((id, i) =>
      auth.admin
        .from("maps")
        .update({ sort_order: i + 1 })
        .eq("id", id),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) return { ok: false, message: dbMessage(failed.error) };
  refreshAll();
  return { ok: true, message: "Ordem dos mapas salva." };
}

/* --------------------------------- Níveis -------------------------------- */

export async function saveLevels(levels: LevelDef[]): Promise<ConfigResult> {
  const auth = await requireAdmin(true);
  if ("error" in auth) return { ok: false, message: auth.error! };
  const clean = levels.map((l) => ({ level: l.level, min: Number(l.min), max: Number(l.max), color: l.color.trim() }));
  const invalid = validateLevels(clean);
  if (invalid) return { ok: false, message: invalid };

  const { error } = await auth.admin.rpc("save_level_configs", {
    p_levels: clean.map((l) => ({ level: l.level, elo_min: l.min, elo_max: l.max, color: l.color })),
  });
  if (error) return { ok: false, message: dbMessage(error, "Não foi possível salvar os níveis.") };
  await audit({ action: "admin.levels_save", outcome: "success", actorId: auth.session.id, detail: { levels: clean } });
  refreshAll();
  return { ok: true, message: "Níveis salvos. O nível de todos os jogadores foi recalculado." };
}

/* ----------------------------- Música de fundo ---------------------------- */

export async function saveMusic(enabled: boolean, url: string): Promise<ConfigResult> {
  const auth = await requireAdmin();
  if ("error" in auth) return { ok: false, message: auth.error! };
  const clean = url.trim();
  if (clean) {
    let parsed: URL;
    try {
      parsed = new URL(clean);
    } catch {
      return { ok: false, message: "Link inválido." };
    }
    if (parsed.protocol !== "https:") return { ok: false, message: "Use um link https." };
    if (/youtube\.com|youtu\.be|spotify\.com/i.test(parsed.hostname)) {
      return { ok: false, message: "YouTube e Spotify não tocam direto no site. Use o link de um arquivo .mp3." };
    }
  }
  if (enabled && !clean) return { ok: false, message: "Informe o link da música para ativar." };

  const now = new Date().toISOString();
  const setting = await auth.admin
    .from("app_settings")
    .upsert({ key: "music_url", value: clean || null, updated_by: auth.session.id, updated_at: now });
  if (setting.error) return { ok: false, message: dbMessage(setting.error) };
  const feature = await auth.admin
    .from("feature_settings")
    .upsert({ feature_key: "background_music", enabled, updated_by: auth.session.id, updated_at: now });
  if (feature.error) return { ok: false, message: dbMessage(feature.error) };
  await audit({ action: "admin.music", outcome: "success", actorId: auth.session.id, detail: { enabled } });
  refreshAll();
  return { ok: true, message: enabled ? "Música de fundo ativada." : "Música de fundo desativada." };
}

/* ------------------------------ Cancelar mix ------------------------------ */

/** "Deletar mix": apaga inscrições, votos, draft e desempate da data e tira o mix da agenda nesse dia. */
export async function cancelMix(scheduleId: string, date: string): Promise<ConfigResult> {
  const auth = await requireAdmin();
  if ("error" in auth) return { ok: false, message: auth.error! };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, message: "Data inválida." };
  const { admin, session } = auth;

  const { data: finalized } = await admin
    .from("mix_matches")
    .select("id")
    .match({ schedule_id: scheduleId, event_date: date })
    .maybeSingle();
  if (finalized) return { ok: false, message: "Esse mix já foi finalizado e está no histórico." };

  const cancel = await admin
    .from("mix_cancellations")
    .upsert({ schedule_id: scheduleId, event_date: date, cancelled_by: session.id });
  if (cancel.error) return { ok: false, message: dbMessage(cancel.error, "Não foi possível deletar o mix.") };

  const match = { schedule_id: scheduleId, event_date: date };
  await admin.from("mix_draft_state").delete().match(match);
  await Promise.all([
    admin.from("mix_registrations").delete().match(match),
    admin.from("map_votes").delete().match(match),
    admin.from("captain_votes").delete().match(match),
    admin.from("map_tiebreaker_rounds").delete().match(match),
  ]);
  await audit({ action: "admin.cancel_mix", outcome: "success", actorId: session.id, scheduleId, eventDate: date });
  refreshAll();
  return { ok: true, message: "Mix deletado. Inscrições e votos dessa data foram apagados." };
}
