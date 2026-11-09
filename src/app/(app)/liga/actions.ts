"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { LEAGUE_COOKIE, validLeagueSlug } from "@/lib/league";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { audit } from "@/services/audit";
import { getSession } from "@/services/auth";
import { visibleLeagues } from "@/services/league";

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
