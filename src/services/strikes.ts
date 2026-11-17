import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendPush } from "@/services/push";
import { starterDelaySeconds } from "@/services/starters";

import { STRIKES_TO_SUSPEND, type StrikeKind } from "@/lib/strikes";

export type { StrikeKind };

export interface Suspension {
  id: number;
  userId: string;
  leagueId: string;
  fromDate: string;
  mixes: number;
  served: number;
  createdAt: string;
}

type SuspensionRow = {
  id: number;
  user_id: string;
  league_id: string;
  from_date: string;
  mixes: number;
  served: number;
  created_at: string;
};

const toSuspension = (r: SuspensionRow): Suspension => ({
  id: Number(r.id),
  userId: r.user_id,
  leagueId: r.league_id,
  fromDate: r.from_date,
  mixes: r.mixes,
  served: r.served,
  createdAt: r.created_at,
});

/** Suspensões em andamento (todas, ou só dos usuários informados). Falha = nenhuma. */
export async function activeSuspensions(userIds?: string[]): Promise<Suspension[]> {
  const admin = createSupabaseAdminClient();
  if (!admin || (userIds && !userIds.length)) return [];
  const { data, error } = await admin.rpc("active_suspensions", { p_users: userIds ?? null });
  if (error) return [];
  return ((data ?? []) as SuspensionRow[]).map(toSuspension);
}

/** Pontos de falta ativos (não vencidos, não perdoados, não usados numa suspensão) por liga. */
export async function strikePoints(userId: string, leagueId: string): Promise<number> {
  const admin = createSupabaseAdminClient();
  if (!admin) return 0;
  const { data, error } = await admin
    .from("mix_strikes")
    .select("points")
    .eq("user_id", userId)
    .eq("league_id", leagueId)
    .is("suspension_id", null)
    .is("pardoned_at", null)
    .gt("expires_at", new Date().toISOString());
  if (error) return 0;
  return (data ?? []).reduce((s, r) => s + (r.points as number), 0);
}

/** Registra a falta (e a suspensão, se chegou a 2). Nunca lança. */
export async function addStrike(input: {
  userId: string;
  scheduleId: string;
  date: string;
  kind: StrikeKind;
  by: string;
}): Promise<{ points: number; suspended: boolean } | null> {
  try {
    const admin = createSupabaseAdminClient();
    if (!admin) return null;
    const { data, error } = await admin.rpc("mix_add_strike", {
      p_user: input.userId,
      p_schedule: input.scheduleId,
      p_date: input.date,
      p_kind: input.kind,
      p_by: input.by,
    });
    if (error) {
      console.error("[faltas] falha ao registrar:", error.message);
      return null;
    }
    return data as { points: number; suspended: boolean };
  } catch (e) {
    console.error("[faltas] falha ao registrar:", e);
    return null;
  }
}

/** Avisa o jogador da falta (ou da suspensão). */
export async function notifyStrike(
  input: { userId: string; scheduleId: string; date: string; kind: StrikeKind },
  r: { points: number; suspended: boolean },
) {
  const what = input.kind === "no_show" ? "Você não compareceu ao mix" : "Você saiu do mix faltando menos de 3h";
  await sendPush(
    { userIds: [input.userId], once: `falta:${input.scheduleId}:${input.date}:${input.userId}:${r.suspended}` },
    r.suspended
      ? {
          title: "Suspenso nos próximos 2 mixes",
          body: `${what}. Com ${STRIKES_TO_SUSPEND} faltas, você só entra como reserva nos próximos 2 mixes da liga.`,
          url: "/dashboard",
          tag: "falta",
        }
      : {
          title: `Falta registrada (${r.points}/${STRIKES_TO_SUSPEND})`,
          body: `${what}. Com ${STRIKES_TO_SUSPEND} faltas em 60 dias, você fica 2 mixes só como reserva.`,
          url: "/dashboard",
          tag: "falta",
        },
  );
}

export interface StrikeRow {
  id: number;
  userId: string;
  leagueId: string;
  date: string;
  kind: StrikeKind;
  points: number;
  createdAt: string;
  expiresAt: string;
  pardoned: boolean;
  suspended: boolean;
}

/** Faltas ainda valendo ou recentes (para o painel do admin). */
export async function recentStrikes(leagueIds: string[]): Promise<StrikeRow[]> {
  const admin = createSupabaseAdminClient();
  if (!admin || !leagueIds.length) return [];
  const { data, error } = await admin
    .from("mix_strikes")
    .select("*")
    .in("league_id", leagueIds)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return [];
  return (data ?? []).map((r) => ({
    id: Number(r.id),
    userId: r.user_id as string,
    leagueId: r.league_id as string,
    date: r.event_date as string,
    kind: r.kind as StrikeKind,
    points: r.points as number,
    createdAt: r.created_at as string,
    expiresAt: r.expires_at as string,
    pardoned: !!r.pardoned_at,
    suspended: r.suspension_id !== null,
  }));
}

/** Faltas e suspensão de quem está vendo, na liga do mix (para o botão de inscrição). */
export async function viewerDiscipline(
  userId: string | null,
  scheduleId: string,
): Promise<{ points: number; suspension: { mixes: number; served: number } | null; starterDelay: number }> {
  const none = { points: 0, suspension: null, starterDelay: 0 };
  const admin = createSupabaseAdminClient();
  if (!admin || !userId) return none;
  const { data: leagueId, error } = await admin.rpc("league_of_schedule", { p_schedule: scheduleId });
  if (error || !leagueId) return none;
  const [points, suspensions, starterDelay] = await Promise.all([
    strikePoints(userId, leagueId as string),
    activeSuspensions([userId]),
    starterDelaySeconds(leagueId as string, userId),
  ]);
  const s = suspensions.find((x) => x.leagueId === leagueId);
  return { points, suspension: s ? { mixes: s.mixes, served: s.served } : null, starterDelay };
}

/** Nomes dos jogadores (para o painel). */
export async function profileNames(ids: string[]): Promise<Map<string, string>> {
  const admin = createSupabaseAdminClient();
  if (!admin || !ids.length) return new Map();
  const { data } = await admin.from("profiles").select("id, display_name").in("id", ids);
  return new Map((data ?? []).map((p) => [p.id as string, p.display_name as string]));
}
