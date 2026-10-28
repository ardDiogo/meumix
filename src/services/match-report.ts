import "server-only";
import type { StatRow } from "@/lib/match-highlights";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { profileAvatars } from "./avatars";

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
  const ids = (records ?? []).map((r) => r.user_id as string | null).filter((id): id is string => !!id);
  const [avatars, { data: nicks }] = await Promise.all([
    profileAvatars(ids),
    ids.length ? supabase.from("profiles").select("id, display_name").in("id", ids) : Promise.resolve({ data: [] }),
  ]);
  const nickOf = new Map((nicks ?? []).map((p) => [p.id as string, p.display_name as string]));
  return {
    platform: (match.platform as MatchReport["platform"]) ?? "manual",
    rows: (records ?? []).map((r, i) => ({
      key: (r.id as string) ?? `r${i}`,
      userId: (r.user_id as string | null) ?? null,
      name: r.player_name as string,
      team: r.team as "A" | "B",
      elo: num(r.elo_after) ?? num(r.elo_before),
      eloDelta:
        r.calculate_elo !== false && r.elo_after != null && r.elo_before != null
          ? Number(r.elo_after) - Number(r.elo_before)
          : null,
      profileNick: r.user_id ? (nickOf.get(r.user_id as string) ?? null) : null,
      avatarUrl: r.user_id ? (avatars.get(r.user_id as string)?.avatarUrl ?? null) : null,
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

/** Médias de um jogador nas outras partidas (base de comparação do mix). */
export interface PlayerAverage {
  mixes: number;
  kdr: number;
  adr: number | null;
  fk: number;
  kast: number | null;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Média de cada jogador em todas as partidas, menos esta. */
export async function playerAverages(matchId: string, userIds: string[]): Promise<Record<string, PlayerAverage>> {
  const supabase = await createSupabaseServerClient();
  if (!supabase || !userIds.length) return {};
  const { data } = await supabase
    .from("player_match_records")
    .select("user_id, kills, deaths, first_kills, adr, kast")
    .in("user_id", userIds)
    .neq("match_id", matchId);
  const byUser = new Map<string, NonNullable<typeof data>>();
  for (const r of data ?? []) byUser.set(r.user_id as string, [...(byUser.get(r.user_id as string) ?? []), r]);
  return Object.fromEntries(
    [...byUser].map(([id, rows]) => {
      const kills = rows.reduce((a, r) => a + (r.kills ?? 0), 0);
      const deaths = rows.reduce((a, r) => a + (r.deaths ?? 0), 0);
      const nums = (k: "adr" | "kast") => rows.map((r) => num(r[k])).filter((v): v is number => v != null);
      return [
        id,
        {
          mixes: rows.length,
          kdr: deaths ? kills / deaths : kills,
          adr: mean(nums("adr")),
          fk: mean(rows.map((r) => r.first_kills ?? 0)) ?? 0,
          kast: mean(nums("kast")),
        },
      ];
    }),
  );
}
