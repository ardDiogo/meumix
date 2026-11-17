import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Titulares da liga e o atraso de inscrição de quem não é titular (0 = desligado).
 * Falha aberta: sem a migração 0054 ou com erro, ninguém tem atraso.
 */
export async function starterRule(leagueId: string | null): Promise<{ delayMinutes: number; starters: Set<string> }> {
  const off = { delayMinutes: 0, starters: new Set<string>() };
  const admin = createSupabaseAdminClient();
  if (!admin || !leagueId) return off;
  const [{ data: league, error }, { data: members }] = await Promise.all([
    admin.from("communities").select("*").eq("id", leagueId).maybeSingle(),
    admin.from("league_members").select("*").eq("league_id", leagueId),
  ]);
  if (error || !league) return off;
  const delayMinutes = Number(league.non_starter_delay_minutes ?? 0) || 0;
  const starters = new Set(
    (members ?? []).filter((m) => m.starter === true && m.active !== false).map((m) => m.user_id as string),
  );
  return { delayMinutes, starters };
}

/** Atraso (em segundos) da inscrição de um jogador por não ser titular. */
export async function starterDelaySeconds(leagueId: string | null, userId: string | null): Promise<number> {
  if (!userId) return 0;
  const rule = await starterRule(leagueId);
  return rule.delayMinutes > 0 && !rule.starters.has(userId) ? rule.delayMinutes * 60 : 0;
}
