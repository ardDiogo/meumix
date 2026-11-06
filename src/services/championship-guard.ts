import "server-only";
import { canManageChampionship, MIGRATION, missing } from "@/lib/championship";
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
