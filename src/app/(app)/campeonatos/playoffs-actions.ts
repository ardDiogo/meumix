"use server";

import { revalidatePath } from "next/cache";
import { PLAYOFF_TEAMS, type PlayoffFormat } from "@/lib/championship";
import { buildBracket } from "@/lib/championship-playoffs";
import { standings } from "@/lib/championship-standings";
import { audit } from "@/services/audit";
import { requireOrganizer } from "@/services/championship-guard";

export type PlayoffResult = { ok: boolean; message: string };

const missing = (code?: string) => code === "42P01" || code === "PGRST205" || code === "42703" || code === "PGRST204";

/**
 * Gera a chave dos playoffs pela classificação final (todos os jogos da fase
 * classificatória finalizados ou cancelados). Pode gerar de novo enquanto
 * nenhum jogo dos playoffs tiver placar. O campeonato passa para "Playoffs".
 */
export async function generatePlayoffs(championshipId: string): Promise<PlayoffResult> {
  const r = await requireOrganizer(championshipId);
  if ("error" in r) return { ok: false, message: r.error ?? "Não foi possível salvar." };
  const { data: ch } = await r.admin
    .from("championships")
    .select("playoff_format, playoff_best_of, points_win, points_loss")
    .eq("id", championshipId)
    .maybeSingle();
  const format = (ch?.playoff_format as PlayoffFormat) ?? "none";
  if (format === "none") return { ok: false, message: "Este campeonato não tem playoffs." };

  const [{ data: teams }, { data: matches, error }, { data: maps }] = await Promise.all([
    r.admin
      .from("championship_teams")
      .select("id, draft_order, created_at")
      .eq("championship_id", championshipId)
      .order("draft_order", { nullsFirst: false })
      .order("created_at"),
    r.admin
      .from("championship_matches")
      .select("id, stage, home_team, away_team, best_of, status")
      .eq("championship_id", championshipId),
    r.admin
      .from("championship_match_maps")
      .select("match_id, score_home, score_away")
      .eq("championship_id", championshipId),
  ]);
  if (error)
    return {
      ok: false,
      message: missing(error.code) ? "Rode as migrações do campeonato no Supabase." : "Não foi possível gerar.",
    };
  const group = (matches ?? []).filter((m) => m.stage === "group");
  if (!group.length) return { ok: false, message: "A fase classificatória ainda não tem jogos." };
  const open = group.filter((m) => m.status !== "finished" && m.status !== "cancelled").length;
  if (open) return { ok: false, message: `Faltam ${open} ${open === 1 ? "jogo" : "jogos"} da fase classificatória.` };
  const playoffs = (matches ?? []).filter((m) => m.stage === "playoff");
  if (playoffs.some((m) => (maps ?? []).some((x) => x.match_id === m.id)))
    return { ok: false, message: "Os playoffs já têm resultado: a chave não pode ser refeita." };

  const table = standings(
    (teams ?? []).map((t) => t.id as string),
    group.map((m) => ({
      home: m.home_team as string,
      away: m.away_team as string,
      bestOf: m.best_of as number,
      maps: (maps ?? [])
        .filter((x) => x.match_id === m.id)
        .map((x) => ({ home: x.score_home as number, away: x.score_away as number })),
    })),
    { pointsWin: Number(ch?.points_win ?? 3), pointsLoss: Number(ch?.points_loss ?? 0) },
  );
  const ranked = table.map((t) => t.team);
  if (ranked.length < PLAYOFF_TEAMS[format]) return { ok: false, message: "Times insuficientes para os playoffs." };

  if (playoffs.length)
    await r.admin.from("championship_matches").delete().eq("championship_id", championshipId).eq("stage", "playoff");
  const { error: insertError } = await r.admin.from("championship_matches").insert(
    buildBracket(format, ranked).map((f) => ({
      championship_id: championshipId,
      stage: "playoff",
      round: f.round,
      leg: f.leg,
      home_team: f.home,
      away_team: f.away,
      best_of: Number(ch?.playoff_best_of ?? 3),
    })),
  );
  if (insertError) return { ok: false, message: "Não foi possível gerar os playoffs." };
  await r.admin
    .from("championships")
    .update({ status: "playoffs", updated_at: new Date().toISOString() })
    .eq("id", championshipId);
  await audit({
    action: "championship.playoffs_generate",
    outcome: "success",
    actorId: r.session.id,
    detail: { championshipId, format, classified: ranked.slice(0, PLAYOFF_TEAMS[format]) },
  });
  revalidatePath("/campeonatos", "layout");
  return { ok: true, message: "Chave dos playoffs gerada." };
}
