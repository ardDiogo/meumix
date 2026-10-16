import "server-only";
import type { StatRow } from "@/lib/match-highlights";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface MatchReport {
  platform: "manual" | "gc" | "faceit";
  rows: StatRow[];
}

const num = (v: unknown) => (v == null || v === "" ? null : Number(v));

/** Estatísticas completas de uma partida finalizada (inclui convidados). */
export async function getMatchReport(matchId: string): Promise<MatchReport | null> {
  if (!/^[0-9a-f-]{36}$/i.test(matchId)) return null;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const [{ data: match }, { data: records, error }] = await Promise.all([
    supabase.from("mix_matches").select("platform").eq("id", matchId).maybeSingle(),
    // `*`: as colunas S/FA/MK/DROP só existem após a migração 0011.
    supabase.from("player_match_records").select("*").eq("match_id", matchId),
  ]);
  if (!match || error) return null;
  return {
    platform: (match.platform as MatchReport["platform"]) ?? "manual",
    rows: (records ?? []).map((r, i) => ({
      key: (r.id as string) ?? `r${i}`,
      userId: (r.user_id as string | null) ?? null,
      name: r.player_name as string,
      team: r.team as "A" | "B",
      elo: num(r.elo_after) ?? num(r.elo_before),
      k: r.kills ?? 0,
      a: r.assists ?? 0,
      d: r.deaths ?? 0,
      adr: num(r.adr),
      kast: num(r.kast),
      s: num(r.s),
      fa: r.fa ?? 0,
      mk: r.mk ?? 0,
      fk: r.first_kills ?? 0,
      rp: r.rp ?? 0,
      drop: r.drop_count ?? 0,
      isMvp: !!r.is_mvp,
      isLanterna: !!r.is_lanterna,
    })),
  };
}
