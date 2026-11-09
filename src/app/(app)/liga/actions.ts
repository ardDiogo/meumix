"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { LEAGUE_COOKIE, validLeagueSlug } from "@/lib/league";
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
