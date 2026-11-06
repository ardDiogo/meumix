import { notFound } from "next/navigation";
import { DraftBoard } from "@/components/championships/draft-board";
import { Card } from "@/components/ui/card";
import { rosterIssues } from "@/lib/championship";
import { potIssues } from "@/lib/championship-draft";
import { getChampionship, getDraft, getRoster } from "@/services/championships";

export const metadata = { title: "Draft do campeonato" };

/** Draft: potes, adedonha entre os capitães e escolhas em serpentina, ao vivo. */
export default async function DraftPage({ params }: PageProps<"/campeonatos/[slug]/draft">) {
  const data = await getChampionship((await params).slug);
  if (!data) notFound();
  const { championship: c, canManage, players: all, session } = data;
  const [{ teams, players }, draft] = await Promise.all([getRoster(c.id), getDraft(c.id)]);
  if (draft.missing)
    return (
      <Card className="p-4 text-sm text-muted">
        {canManage ? (
          <>
            Para o draft, rode a migração <code className="text-fg">0039_championship_draft.sql</code> no SQL Editor do
            Supabase.
          </>
        ) : (
          "O draft ainda não está disponível."
        )}
      </Card>
    );
  const byId = new Map(all.map((p) => [p.id, p]));
  const captains = new Set(teams.map((t) => t.captainId).filter((x): x is string => !!x));
  const issues = [...rosterIssues(c, teams, players), ...potIssues(players, captains, c.potCount, c.teamCount)];
  return (
    <DraftBoard
      championshipId={c.id}
      status={draft.status}
      teams={teams}
      players={players.map((p) => ({
        ...p,
        nickname: byId.get(p.userId)?.nickname ?? "Jogador",
        avatarUrl: byId.get(p.userId)?.avatarUrl ?? null,
      }))}
      rounds={draft.rounds}
      picks={draft.picks}
      potCount={c.potCount}
      viewerId={session?.id ?? null}
      isManager={canManage}
      issues={issues}
    />
  );
}
