import "server-only";
import { canManageChampionship, MIGRATION, missing, type PlayoffFormat } from "@/lib/championship";
import { autoStatus } from "@/lib/championship-playoffs";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSession } from "./auth";

const validId = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

/**
 * Confere quem organiza o campeonato (criador, liberados, super admin) e
 * devolve o cliente do servidor para gravar. Usado por todas as ações do campeonato.
 */
export async function requireOrganizer(id: string) {
  const session = await getSession();
  const admin = createSupabaseAdminClient();
  if (!session || !admin || !validId(id)) return { error: "Não foi possível salvar." } as const;
  const [{ data: ch, error }, { data: orgs }] = await Promise.all([
    admin
      .from("championships")
      .select("id, slug, created_by, team_count, players_per_team, status")
      .eq("id", id)
      .maybeSingle(),
    admin.from("championship_organizers").select("user_id").eq("championship_id", id),
  ]);
  if (error) return { error: missing(error.code) ? MIGRATION : "Não foi possível salvar." } as const;
  if (!ch) return { error: "Campeonato não encontrado." } as const;
  const ok = canManageChampionship(
    session,
    { createdBy: ch.created_by as string | null },
    (orgs ?? []).map((o) => o.user_id as string),
  );
  if (!ok) return { error: "Só quem organiza este campeonato pode alterá-lo." } as const;
  return {
    session,
    admin,
    ch: {
      id: ch.id as string,
      slug: ch.slug as string,
      createdBy: ch.created_by as string | null,
      teamCount: Number(ch.team_count),
      playersPerTeam: Number(ch.players_per_team),
      status: ch.status as string,
    },
  } as const;
}

/**
 * Atualiza o status do campeonato pelo andamento dos jogos (Finalizado quando
 * sai o campeão; volta se o resultado for desfeito). Nunca lança erro.
 */
export async function syncChampionshipStatus(
  admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  championshipId: string,
) {
  try {
    const [{ data: ch }, { data: matches }] = await Promise.all([
      admin.from("championships").select("status, playoff_format").eq("id", championshipId).maybeSingle(),
      admin
        .from("championship_matches")
        .select("stage, round, status, winner_team")
        .eq("championship_id", championshipId),
    ]);
    if (!ch) return null;
    const next = autoStatus(
      ch.status as string,
      ch.playoff_format as PlayoffFormat,
      (matches ?? []).map((m) => ({
        stage: m.stage as "group" | "playoff",
        round: m.round as number,
        status: m.status as string,
        winnerTeam: (m.winner_team as string | null) ?? null,
      })),
    );
    if (next)
      await admin
        .from("championships")
        .update({ status: next, updated_at: new Date().toISOString() })
        .eq("id", championshipId);
    return next;
  } catch {
    return null;
  }
}

/** Formação das equipes do campeonato (sem a migração 0044: draft). */
export async function teamModeOf(
  admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  championshipId: string,
): Promise<"draft" | "code"> {
  const { data } = await admin.from("championships").select("*").eq("id", championshipId).maybeSingle();
  return (data as { team_mode?: string } | null)?.team_mode === "code" ? "code" : "draft";
}
