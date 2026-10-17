import { mapName } from "@/lib/maps";
import { playerSlug } from "@/lib/player-slug";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { MapId } from "@/types/domain";

/**
 * API pública (somente leitura) do histórico de mixes finalizados.
 * GET /api/historico?jogador=<nick|id>&de=AAAA-MM-DD&ate=AAAA-MM-DD&limite=20
 * Não expõe e-mails nem dados privados.
 */

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "cache-control": "public, max-age=60, s-maxage=60",
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (v: string) => DATE.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const de = url.searchParams.get("de");
  const ate = url.searchParams.get("ate");
  const jogador = url.searchParams.get("jogador")?.trim();
  const limite = Math.min(Math.max(Number(url.searchParams.get("limite")) || 20, 1), 100);
  if ((de && !validDate(de)) || (ate && !validDate(ate))) {
    return Response.json({ erro: "Datas no formato AAAA-MM-DD." }, { status: 400, headers: CORS });
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) return Response.json({ erro: "Banco não configurado." }, { status: 503, headers: CORS });

  const { data: profiles } = await supabase.from("profiles").select("id, display_name");
  const nickOf = new Map((profiles ?? []).map((p) => [p.id as string, p.display_name as string]));

  let matchIds: string[] | null = null;
  if (jogador) {
    const userId =
      (profiles ?? []).find((p) => p.id === jogador || playerSlug(p.display_name as string) === playerSlug(jogador))
        ?.id ?? null;
    if (!userId) return Response.json({ erro: "Jogador não encontrado." }, { status: 404, headers: CORS });
    const { data } = await supabase.from("player_match_records").select("match_id").eq("user_id", userId);
    matchIds = (data ?? []).map((r) => r.match_id as string);
    if (!matchIds.length) return Response.json({ total: 0, mixes: [] }, { headers: CORS });
  }

  let query = supabase
    .from("mix_matches")
    .select("id, event_date, platform, maps, team_a_name, team_b_name, finalized_at")
    .order("event_date", { ascending: false })
    .limit(limite);
  if (de) query = query.gte("event_date", de);
  if (ate) query = query.lte("event_date", ate);
  if (matchIds) query = query.in("id", matchIds);
  const { data: matches, error } = await query;
  if (error) return Response.json({ erro: "Falha ao consultar." }, { status: 500, headers: CORS });
  if (!matches?.length) return Response.json({ total: 0, mixes: [] }, { headers: CORS });

  const { data: records } = await supabase
    .from("player_match_records")
    .select("*")
    .in(
      "match_id",
      matches.map((m) => m.id),
    );

  const origin = url.origin;
  const mixes = matches.map((m) => {
    const maps = (m.maps as { map_id: string; score_a: number; score_b: number }[]) ?? [];
    const winsA = maps.filter((x) => x.score_a > x.score_b).length;
    const winsB = maps.filter((x) => x.score_b > x.score_a).length;
    const rows = (records ?? []).filter((r) => r.match_id === m.id);
    const firstOf = (team: string) => rows.find((r) => r.team === team && r.user_id);
    const teamName = (team: "A" | "B", custom: unknown) =>
      (custom as string | null) ||
      (firstOf(team) ? `Time ${nickOf.get(firstOf(team)!.user_id as string) ?? "?"}` : `Time ${team}`);
    return {
      id: m.id,
      data: m.event_date,
      plataforma: m.platform,
      finalizado_em: m.finalized_at,
      url: `${origin}/mixes/${m.id}`,
      times: { A: teamName("A", m.team_a_name), B: teamName("B", m.team_b_name) },
      placar: { A: winsA, B: winsB },
      vencedor: winsA === winsB ? null : winsA > winsB ? "A" : "B",
      mapas: maps.map((x) => ({ mapa: mapName(x.map_id as MapId), A: x.score_a, B: x.score_b })),
      jogadores: rows.map((r) => {
        const nick = r.user_id ? (nickOf.get(r.user_id as string) ?? r.player_name) : r.player_name;
        return {
          nick,
          perfil: r.user_id ? `${origin}/jogadores/${playerSlug(nick as string)}` : null,
          time: r.team,
          k: r.kills,
          a: r.assists,
          d: r.deaths,
          diff: (r.kills as number) - (r.deaths as number),
          adr: r.adr == null ? null : Number(r.adr),
          kdr: Math.round(((r.kills as number) / Math.max(r.deaths as number, 1)) * 100) / 100,
          kast: r.kast == null ? null : Number(r.kast),
          fk: r.first_kills,
          rp: r.rp,
          mvp: !!r.is_mvp,
          lanterna: !!r.is_lanterna,
          elo_antes: r.elo_before ?? null,
          elo_depois: r.elo_after ?? null,
        };
      }),
    };
  });
  return Response.json({ total: mixes.length, mixes }, { headers: CORS });
}
