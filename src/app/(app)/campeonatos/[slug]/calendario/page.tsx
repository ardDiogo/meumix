import { notFound } from "next/navigation";
import Link from "next/link";
import { CalendarBoard } from "@/components/championships/calendar-board";
import { GamesBoard } from "@/components/championships/games-board";
import { cn } from "@/lib/utils";
import { formatDays } from "@/components/championships/format";
import { Card } from "@/components/ui/card";
import { playoffLabel, roundTitle } from "@/lib/championship-playoffs";
import { seriesState } from "@/lib/championship-standings";
import { getChampionship, getDraft, getMapResults, getMatches, getRoster } from "@/services/championships";

export const metadata = { title: "Calendário do campeonato" };

/** Calendário: rodadas, propostas de data entre capitães e aprovação da organização. */
export default async function CalendarPage({ params, searchParams }: PageProps<"/campeonatos/[slug]/calendario">) {
  const data = await getChampionship((await params).slug);
  const { view } = await searchParams;
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
  const playoffs = matches.filter((m) => m.stage === "playoff");
  // Placar em mapas (MD3) ou em rounds (MD1) dos jogos com resultado.
  const scores = Object.fromEntries(
    [...group, ...playoffs].flatMap((m) => {
      const mine = maps.filter((x) => x.matchId === m.id);
      if (!mine.length) return [];
      if (m.bestOf === 1) return [[m.id, { home: mine[0]!.home, away: mine[0]!.away }]];
      const s = seriesState(mine, m.bestOf);
      return [[m.id, { home: s.home, away: s.away }]];
    }),
  );
  // Pendências de quem está vendo (para o aviso na aba Agendamento).
  const viewer = session?.id ?? null;
  const myTeams = new Set(teams.filter((t) => viewer && t.captainId === viewer).map((t) => t.id));
  const openProposals = proposals.filter((p) => p.status === "pending");
  const todo =
    openProposals.filter((p) => {
      const m = matches.find((x) => x.id === p.matchId);
      return m && [m.homeTeam, m.awayTeam].some((t) => t && myTeams.has(t) && t !== p.proposedByTeam);
    }).length +
    (canManage ? matches.filter((m) => m.status === "approval").length : 0) +
    matches.filter(
      (m) => ["pending", "postponed"].includes(m.status) && [m.homeTeam, m.awayTeam].some((t) => t && myTeams.has(t)),
    ).length;
  const list = view === "agendamento";
  const tab = (active: boolean) =>
    cn(
      "flex h-8 items-center gap-1.5 rounded-[5px] px-3 text-sm font-medium whitespace-nowrap transition-colors",
      active ? "bg-surface-3 text-fg" : "text-muted hover:text-fg",
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Visualização" className="inline-flex rounded-md border border-border bg-surface p-0.5">
          <Link
            href={`/campeonatos/${c.slug}/calendario`}
            className={tab(!list)}
            aria-current={!list ? "page" : undefined}
          >
            Tabela de jogos
          </Link>
          <Link
            href={`/campeonatos/${c.slug}/calendario?view=agendamento`}
            className={tab(list)}
            aria-current={list ? "page" : undefined}
          >
            Agendamento
            {todo > 0 && (
              <span className="rounded-full bg-brand px-1.5 text-[11px] leading-4 font-bold text-brand-fg">{todo}</span>
            )}
          </Link>
        </nav>
        <span className="text-xs text-muted">
          {`Jogos ${formatDays(c.matchDays).toLowerCase()}, das ${c.windowStart} às ${c.windowEnd}`}
        </span>
      </div>
      {list ? (
        <CalendarBoard
          championshipId={c.id}
          teams={teams}
          matches={[...group, ...playoffs.map((m) => ({ ...m, label: playoffLabel(c.playoffFormat, m.round, m.leg) }))]}
          playoffTitles={Object.fromEntries(playoffs.map((m) => [m.round, roundTitle(c.playoffFormat, m.round)]))}
          proposals={proposals}
          viewerId={session?.id ?? null}
          isManager={canManage}
          servers={c.servers}
          windowText={`Jogos ${formatDays(c.matchDays).toLowerCase()}, das ${c.windowStart} às ${c.windowEnd}`}
          canGenerate={group.every((m) => m.status === "pending")}
          draftDone={draft.status === "done" || c.teamMode === "code"}
          slug={c.slug}
          scores={scores}
        />
      ) : group.length ? (
        <Card className="p-4">
          <GamesBoard slug={c.slug} teams={teams} matches={matches} scores={scores} format={c.playoffFormat} />
        </Card>
      ) : (
        <Card className="p-6 text-center text-sm text-muted">
          {draft.status === "done" || c.teamMode === "code"
            ? canManage
              ? "Gere os confrontos na aba Agendamento."
              : "A tabela aparece quando a organização gerar os confrontos."
            : "Os confrontos são gerados depois do draft."}
        </Card>
      )}
    </div>
  );
}
