import "server-only";
import type { Championship } from "@/lib/championship";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSession } from "./auth";
import { listChampionships } from "./championships";

/** Campeonatos em destaque no Dashboard: inscrições abertas primeiro, depois os em andamento. */
const SHOWN: Championship["status"][] = ["registration", "teams", "running", "playoffs"];

export interface HomeChampionship {
  championship: Championship;
  registered: number;
  vagas: number;
  teams: number;
  /** A pessoa logada: inscrita? em qual time? */
  mine: { registered: boolean; team: string | null } | null;
}

export async function dashboardChampionships(limit = 2): Promise<HomeChampionship[]> {
  const { list } = await listChampionships();
  const shown = list
    .filter((c) => SHOWN.includes(c.status))
    .sort((a, b) => SHOWN.indexOf(a.status) - SHOWN.indexOf(b.status))
    .slice(0, limit);
  if (!shown.length) return [];
  const supabase = await createSupabaseServerClient();
  const session = await getSession();
  if (!supabase) return [];
  const ids = shown.map((c) => c.id);
  const [{ data: players }, { data: teams }] = await Promise.all([
    supabase.from("championship_players").select("championship_id, user_id, team_id").in("championship_id", ids),
    supabase.from("championship_teams").select("id, championship_id, name").in("championship_id", ids),
  ]);
  return shown.map((c) => {
    const ps = (players ?? []).filter((p) => p.championship_id === c.id);
    const me = session ? ps.find((p) => p.user_id === session.id) : undefined;
    return {
      championship: c,
      registered: ps.length,
      vagas: c.teamCount * c.playersPerTeam,
      teams: (teams ?? []).filter((t) => t.championship_id === c.id).length,
      mine: session
        ? {
            registered: !!me,
            team: me?.team_id
              ? (((teams ?? []).find((t) => t.id === me.team_id)?.name as string | undefined) ?? null)
              : null,
          }
        : null,
    };
  });
}
