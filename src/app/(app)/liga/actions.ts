"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { LEAGUE_COOKIE, validLeagueSlug } from "@/lib/league";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { audit } from "@/services/audit";
import { getSession } from "@/services/auth";
import { getCurrentLeague, visibleLeagues } from "@/services/league";
import { isPlatformAdmin } from "@/lib/auth/permissions";
import { generateJoinCode, missing, normalizeCode } from "@/lib/championship";
import { randomInt } from "node:crypto";

/** Troca a liga do seletor do topo (guardada num cookie por 1 ano). */
export async function setLeague(slug: string): Promise<{ ok: boolean; message: string }> {
  if (!validLeagueSlug(slug)) return { ok: false, message: "Liga inválida." };
  const league = (await visibleLeagues()).find((l) => l.slug === slug);
  if (!league) return { ok: false, message: "Você não participa dessa liga." };
  (await cookies()).set(LEAGUE_COOKIE, slug, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
  revalidatePath("/", "layout");
  return { ok: true, message: `Liga: ${league.name}.` };
}

/** Renomeia uma liga (só o super admin). */
export async function renameLeague(id: string, name: string): Promise<{ ok: boolean; message: string }> {
  const session = await getSession();
  if (!session?.isSuperAdmin) return { ok: false, message: "Só o super admin renomeia as ligas." };
  const clean = name.replace(/\s+/g, " ").trim();
  if (clean.length < 3 || clean.length > 40) return { ok: false, message: "Use um nome de 3 a 40 caracteres." };
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, message: "Liga inválida." };
  const admin = createSupabaseAdminClient();
  if (!admin) return { ok: false, message: "O banco de dados não está configurado no servidor." };
  const { data: before } = await admin.from("communities").select("name").eq("id", id).maybeSingle();
  if (!before) return { ok: false, message: "Liga não encontrada." };
  const { error } = await admin.from("communities").update({ name: clean }).eq("id", id);
  if (error) return { ok: false, message: "Não foi possível salvar o nome." };
  await audit({
    action: "league.rename",
    outcome: "success",
    actorId: session.id,
    detail: { leagueId: id, de: before.name, para: clean },
  });
  revalidatePath("/", "layout");
  return { ok: true, message: `Liga renomeada: ${clean}.` };
}

/* -------------------------- Convite e membros (Fase 4) -------------------------- */

type Result = { ok: boolean; message: string };
const validId = (id: string) => /^[0-9a-f-]{36}$/i.test(id);
const MIGRATION = "Rode a migração 0049_league_access.sql no Supabase.";
const secureRandom = () => randomInt(0, 1_000_000_000) / 1_000_000_000;

/** Quem gerencia a liga atual: admin da plataforma ou admin da liga. */
async function leagueManager() {
  const session = await getSession();
  const league = await getCurrentLeague();
  const admin = createSupabaseAdminClient();
  if (!session || !league || league.none || !admin) return { error: "Escolha uma liga no topo da página." } as const;
  if (!isPlatformAdmin(session) && session.communityRole !== "admin")
    return { error: "Apenas administradores da liga." } as const;
  return { session, league, admin } as const;
}

function refreshAll() {
  revalidatePath("/", "layout");
}

/** Entra na liga pelo código do convite (link /liga/entrar?codigo=...). */
export async function joinLeagueByCode(raw: string): Promise<Result & { slug?: string }> {
  const session = await getSession();
  if (!session) return { ok: false, message: "Entre na sua conta para usar o convite." };
  const code = normalizeCode(raw);
  if (code.length !== 6) return { ok: false, message: "O código tem 6 letras e números." };
  const admin = createSupabaseAdminClient();
  if (!admin) return { ok: false, message: "O banco de dados não está configurado no servidor." };
  const { data: invite, error } = await admin
    .from("league_codes")
    .select("league_id, communities(slug, name)")
    .eq("code", code)
    .maybeSingle();
  if (error) return { ok: false, message: missing(error.code) ? MIGRATION : "Não foi possível usar o código." };
  const league = (Array.isArray(invite?.communities) ? invite.communities[0] : invite?.communities) as
    { slug: string; name: string } | undefined;
  if (!invite || !league) {
    await audit({ action: "league.join", outcome: "invalid_code", actorId: session.id });
    return { ok: false, message: "Código não encontrado. Confira com o admin da liga." };
  }
  const { data: before } = await admin
    .from("league_members")
    .select("active")
    .eq("league_id", invite.league_id)
    .eq("user_id", session.id)
    .maybeSingle();
  const { error: joinError } = await admin
    .from("league_members")
    .upsert({ league_id: invite.league_id, user_id: session.id, active: true }, { onConflict: "league_id,user_id" });
  if (joinError) return { ok: false, message: "Não foi possível entrar na liga." };
  // Quem é novo na liga começa no ELO inicial do nível GC.
  if (!before) await admin.rpc("recompute_league_elo", { p_league: invite.league_id });
  (await cookies()).set(LEAGUE_COOKIE, league.slug, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
  await audit({
    action: "league.join",
    outcome: "success",
    actorId: session.id,
    detail: { liga: league.slug, ja_era_membro: before?.active === true },
  });
  refreshAll();
  return {
    ok: true,
    slug: league.slug,
    message: before?.active ? `Você já está no ${league.name}.` : `Bem-vindo ao ${league.name}!`,
  };
}

/** Código de convite da liga atual (cria na primeira vez). */
export async function leagueInvite(): Promise<Result & { code?: string }> {
  const r = await leagueManager();
  if ("error" in r) return { ok: false, message: r.error ?? "Sem permissão." };
  const { data, error } = await r.admin.from("league_codes").select("code").eq("league_id", r.league.id).maybeSingle();
  if (error) return { ok: false, message: missing(error.code) ? MIGRATION : "Não foi possível ler o código." };
  if (data) return { ok: true, message: "", code: data.code as string };
  return newCode(r);
}

/** Gera outro código (o anterior deixa de valer; quem já entrou continua na liga). */
export async function regenerateLeagueCode(): Promise<Result & { code?: string }> {
  const r = await leagueManager();
  if ("error" in r) return { ok: false, message: r.error ?? "Sem permissão." };
  return newCode(r);
}

async function newCode(r: Exclude<Awaited<ReturnType<typeof leagueManager>>, { error: string }>) {
  for (let i = 0; i < 5; i++) {
    const code = generateJoinCode(secureRandom);
    const { error } = await r.admin
      .from("league_codes")
      .upsert({ league_id: r.league.id, code, updated_at: new Date().toISOString() }, { onConflict: "league_id" });
    if (!error) {
      await audit({
        action: "league.code",
        outcome: "success",
        actorId: r.session.id,
        detail: { liga: r.league.slug },
      });
      return { ok: true, message: "Novo código gerado. O anterior deixou de valer.", code };
    }
    if (error.code !== "23505")
      return { ok: false, message: missing(error.code) ? MIGRATION : "Não foi possível gerar." };
  }
  return { ok: false, message: "Não foi possível gerar um código. Tente de novo." };
}

/** Adiciona (ou reativa) e remove alguém da liga atual. */
export async function setLeagueMember(userId: string, on: boolean): Promise<Result> {
  const r = await leagueManager();
  if ("error" in r) return { ok: false, message: r.error ?? "Sem permissão." };
  if (!validId(userId)) return { ok: false, message: "Jogador inválido." };
  if (!on && userId === r.session.id && !isPlatformAdmin(r.session))
    return { ok: false, message: "Você não pode remover a si mesmo." };
  const { data: before } = await r.admin
    .from("league_members")
    .select("user_id")
    .eq("league_id", r.league.id)
    .eq("user_id", userId)
    .maybeSingle();
  const { error } = on
    ? await r.admin
        .from("league_members")
        .upsert({ league_id: r.league.id, user_id: userId, active: true }, { onConflict: "league_id,user_id" })
    : await r.admin
        .from("league_members")
        .update({ active: false, role: "player" })
        .eq("league_id", r.league.id)
        .eq("user_id", userId);
  if (error) return { ok: false, message: missing(error.code) ? MIGRATION : "Não foi possível salvar." };
  if (on && !before) await r.admin.rpc("recompute_league_elo", { p_league: r.league.id });
  await audit({
    action: on ? "league.member_add" : "league.member_remove",
    outcome: "success",
    actorId: r.session.id,
    detail: { liga: r.league.slug, userId },
  });
  refreshAll();
  return { ok: true, message: on ? `Adicionado ao ${r.league.name}.` : `Removido do ${r.league.name}.` };
}

/** Torna (ou deixa de ser) admin da liga atual. */
export async function setLeagueAdmin(userId: string, on: boolean): Promise<Result> {
  const r = await leagueManager();
  if ("error" in r) return { ok: false, message: r.error ?? "Sem permissão." };
  if (!validId(userId)) return { ok: false, message: "Jogador inválido." };
  if (!on && userId === r.session.id && !isPlatformAdmin(r.session))
    return { ok: false, message: "Peça a outro admin para tirar o seu acesso." };
  const { data, error } = await r.admin
    .from("league_members")
    .update({ role: on ? "admin" : "player" })
    .eq("league_id", r.league.id)
    .eq("user_id", userId)
    .eq("active", true)
    .select("user_id");
  if (error) return { ok: false, message: missing(error.code) ? MIGRATION : "Não foi possível salvar." };
  if (!data?.length) return { ok: false, message: "A pessoa precisa ser membro da liga." };
  await audit({
    action: on ? "league.admin_add" : "league.admin_remove",
    outcome: "success",
    actorId: r.session.id,
    detail: { liga: r.league.slug, userId },
  });
  refreshAll();
  return { ok: true, message: on ? `Agora é admin do ${r.league.name}.` : `Deixou de ser admin do ${r.league.name}.` };
}
