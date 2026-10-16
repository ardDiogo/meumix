import "server-only";
import { ACCEPT_RATIO, suggestTeams, winProbability, type BalancePlayer } from "@/lib/team-balance";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface SuggestionView {
  teamA: string[];
  teamB: string[];
  scoreA: number;
  scoreB: number;
  /** Chance do time A (0–1). */
  probA: number;
  status: "pending" | "accepted" | "rejected";
  agree: number;
  disagree: number;
  needed: number;
  myVote: boolean | null;
  /** Ajuste do CSRep usado no cálculo. */
  usesCsrep: boolean;
}

type Client = NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;

/** Dados de cada jogador para o balanceamento (ELO, nível, histórico e HLTV do CSRep). */
export async function loadBalancePlayers(client: Client, ids: string[]): Promise<BalancePlayer[]> {
  if (!ids.length) return [];
  const [{ data: profiles }, analyses] = await Promise.all([
    client
      .from("profiles")
      .select("id, elo, level, mixes_played, total_wins, mvp_count, lanterna_count, avg_adr, avg_kast")
      .in("id", ids),
    client
      .from("player_ai_analyses")
      .select("user_id, metrics, created_at")
      .in("user_id", ids)
      .order("created_at", { ascending: false }),
  ]);
  const hltv = new Map<string, number>();
  if (!analyses.error) {
    for (const a of analyses.data ?? []) {
      const v = (a.metrics as { hltv_rating?: number | null })?.hltv_rating;
      if (!hltv.has(a.user_id as string) && typeof v === "number") hltv.set(a.user_id as string, v);
    }
  }
  const byId = new Map((profiles ?? []).map((p) => [p.id as string, p]));
  return ids.map((id) => {
    const p = byId.get(id);
    return {
      id,
      elo: (p?.elo as number) ?? 0,
      level: (p?.level as number) ?? 1,
      games: (p?.mixes_played as number) ?? 0,
      wins: (p?.total_wins as number) ?? 0,
      mvps: (p?.mvp_count as number) ?? 0,
      lanterns: (p?.lanterna_count as number) ?? 0,
      adr: p?.avg_adr == null ? null : Number(p.avg_adr),
      kast: p?.avg_kast == null ? null : Number(p.avg_kast),
      hltv: hltv.get(id) ?? null,
    };
  });
}

/** Chance do time A com os dados atuais dos jogadores. */
export async function teamWinProbability(teamA: string[], teamB: string[]) {
  const client = await createSupabaseServerClient();
  if (!client || !teamA.length || !teamB.length) return null;
  const players = await loadBalancePlayers(client, [...teamA, ...teamB]);
  const by = new Map(players.map((p) => [p.id, p]));
  return winProbability(
    teamA.map((id) => by.get(id)!),
    teamB.map((id) => by.get(id)!),
  );
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

/**
 * Garante a sugestão quando há 10 classificados, a função está ligada e a
 * escolha de times não começou. Se os classificados mudarem, refaz.
 * Falha aberta: sem a migração 0014, simplesmente não há sugestão.
 */
export async function syncSuggestion(opts: {
  scheduleId: string;
  date: string;
  classified: string[];
  maxPlayers: number;
  enabled: boolean;
  draftStarted: boolean;
}) {
  const admin = createSupabaseAdminClient();
  if (!admin) return;
  const match = { schedule_id: opts.scheduleId, event_date: opts.date };
  const { data: current, error } = await admin
    .from("mix_team_suggestions")
    .select("team_a, team_b, status")
    .match(match)
    .maybeSingle();
  if (error) return;
  const members = current ? [...(current.team_a as string[]), ...(current.team_b as string[])] : [];
  const valid = current && sameSet(members, opts.classified);

  if (current && !valid && current.status !== "accepted") {
    await admin.from("mix_team_suggestions").delete().match(match);
  }
  if (valid || opts.draftStarted || !opts.enabled) return;
  if (opts.maxPlayers !== 10 || opts.classified.length !== 10) return;

  const players = await loadBalancePlayers(admin, opts.classified);
  const s = suggestTeams(players);
  if (!s) return;
  const by = new Map(players.map((p) => [p.id, p]));
  const probA = winProbability(
    s.teamA.map((id) => by.get(id)!),
    s.teamB.map((id) => by.get(id)!),
  );
  await admin.from("mix_team_suggestions").upsert(
    {
      ...match,
      team_a: s.teamA,
      team_b: s.teamB,
      score_a: s.scoreA,
      score_b: s.scoreB,
      win_prob_a: probA,
      status: "pending",
    },
    { onConflict: "schedule_id,event_date", ignoreDuplicates: true },
  );
}

export async function loadSuggestion(
  scheduleId: string,
  date: string,
  viewerId: string | null,
  classified: string[],
): Promise<SuggestionView | null> {
  const client = await createSupabaseServerClient();
  if (!client) return null;
  const match = { schedule_id: scheduleId, event_date: date };
  const [{ data: s, error }, { data: votes }] = await Promise.all([
    client.from("mix_team_suggestions").select("*").match(match).maybeSingle(),
    client.from("mix_team_suggestion_votes").select("user_id, agree").match(match),
  ]);
  if (error || !s) return null;
  const counted = (votes ?? []).filter((v) => classified.includes(v.user_id as string));
  const players = await loadBalancePlayers(client, [...(s.team_a as string[]), ...(s.team_b as string[])]);
  return {
    teamA: s.team_a as string[],
    teamB: s.team_b as string[],
    scoreA: Number(s.score_a ?? 0),
    scoreB: Number(s.score_b ?? 0),
    probA: Number(s.win_prob_a ?? 0.5),
    status: s.status as SuggestionView["status"],
    agree: counted.filter((v) => v.agree).length,
    disagree: counted.filter((v) => !v.agree).length,
    needed: Math.ceil(classified.length * ACCEPT_RATIO),
    myVote: viewerId ? ((counted.find((v) => v.user_id === viewerId)?.agree as boolean | undefined) ?? null) : null,
    usesCsrep: players.some((p) => p.hltv != null),
  };
}
