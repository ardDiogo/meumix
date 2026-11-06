import { notFound } from "next/navigation";
import { CalendarBoard } from "@/components/championships/calendar-board";
import { formatDays } from "@/components/championships/format";
import { Card } from "@/components/ui/card";
import { seriesState } from "@/lib/championship-standings";
import { getChampionship, getDraft, getMapResults, getMatches, getRoster } from "@/services/championships";

export const metadata = { title: "Calendário do campeonato" };

/** Calendário: rodadas, propostas de data entre capitães e aprovação da organização. */
export default async function CalendarPage({ params }: PageProps<"/campeonatos/[slug]/calendario">) {
  const data = await getChampionship((await params).slug);
  if (!data) notFound();
  const { championship: c, canManage, session } = data;
  const [{ teams }, draft, { matches, proposals, missing }, { maps }] = await Promise.all([
    getRoster(c.id),
    getDraft(c.id),
    getMatches(c.id),
    getMapResults(c.id),
  ]);
  if (missing)
    return (
      <Card className="p-4 text-sm text-muted">
        {canManage ? (
          <>
            Para o calendário, rode a migração <code className="text-fg">0040_championship_matches.sql</code> no SQL
            Editor do Supabase.
          </>
        ) : (
          "O calendário ainda não está disponível."
        )}
      </Card>
    );
  const group = matches.filter((m) => m.stage === "group");
  // Placar em mapas (MD3) ou em rounds (MD1) dos jogos com resultado.
  const scores = Object.fromEntries(
    group.flatMap((m) => {
      const mine = maps.filter((x) => x.matchId === m.id);
      if (!mine.length) return [];
      if (m.bestOf === 1) return [[m.id, { home: mine[0]!.home, away: mine[0]!.away }]];
      const s = seriesState(mine, m.bestOf);
      return [[m.id, { home: s.home, away: s.away }]];
    }),
  );
  return (
    <CalendarBoard
      championshipId={c.id}
      teams={teams}
      matches={group}
      proposals={proposals}
      viewerId={session?.id ?? null}
      isManager={canManage}
      servers={c.servers}
      windowText={`Jogos ${formatDays(c.matchDays).toLowerCase()}, das ${c.windowStart} às ${c.windowEnd}`}
      canGenerate={group.every((m) => m.status === "pending")}
      draftDone={draft.status === "done"}
      slug={c.slug}
      scores={scores}
    />
  );
}
