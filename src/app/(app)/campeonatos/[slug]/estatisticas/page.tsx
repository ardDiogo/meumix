import { Crown, Map as MapIcon2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TeamLogo } from "@/components/championships/team-logo";
import { MapIcon } from "@/components/maps/map-icon";
import { Avatar } from "@/components/ui/avatar";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { BOARDS, bestByMap, kdOf, leaders, minMapsFor, mvpOf } from "@/lib/championship-stats";
import { mapName } from "@/lib/maps";
import { cn } from "@/lib/utils";
import type { MapId } from "@/types/domain";
import { getChampionship } from "@/services/championships";
import { getSummary } from "@/services/championship-summary";

export const metadata = { title: "Estatísticas do campeonato" };

const dec = (n: number | null, d = 2) =>
  n == null ? "-" : n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

/** Estatísticas do campeonato (só os mapas importados da GC; separadas dos mixes). */
export default async function StatsPage({ params }: PageProps<"/campeonatos/[slug]/estatisticas">) {
  const data = await getChampionship((await params).slug);
  if (!data) notFound();
  const { championship: c, players: all } = data;
  const s = await getSummary(c);
  const byUser = new Map(all.map((p) => [p.id, p]));
  const teamOfUser = new Map(s.players.map((p) => [p.userId, s.teams.find((t) => t.id === p.teamId)]));
  const href = (uid: string) => `/campeonatos/${c.slug}/jogadores/${uid}`;
  const person = (uid: string) => ({
    name: byUser.get(uid)?.nickname ?? "Jogador",
    avatar: byUser.get(uid)?.avatarUrl ?? null,
  });

  if (!s.lines.length)
    return (
      <Card>
        <EmptyState
          icon={MapIcon2}
          title="Sem estatísticas ainda"
          description="Os números aparecem quando os jogos forem importados da GC (Enviar ao MeuMix)."
        />
      </Card>
    );

  const mvp = mvpOf(s.lines);
  const min = minMapsFor(s.lines);
  const sorted = [...s.lines].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || b.k - a.k);
  const teamBoards = [
    {
      title: "Mais rounds vencidos",
      rows: [...s.teamTotals].sort((a, b) => b.roundsWon - a.roundsWon).slice(0, 5),
      value: (r: (typeof s.teamTotals)[number]) => String(r.roundsWon),
    },
    {
      title: "Melhor aproveitamento",
      rows: [...s.teamTotals]
        .filter((r) => r.played)
        .sort((a, b) => b.efficiency - a.efficiency || b.roundsWon - a.roundsWon)
        .slice(0, 5),
      value: (r: (typeof s.teamTotals)[number]) => `${r.efficiency}% (${r.wins}/${r.played})`,
    },
  ];

  return (
    <div className="space-y-6">
      {mvp?.userId && (
        <Card className="overflow-hidden border-purple-500/50">
          <div className="flex flex-wrap items-center gap-4 bg-gradient-to-r from-purple-500/20 via-transparent to-transparent px-5 py-4">
            <Avatar
              name={person(mvp.userId).name}
              src={person(mvp.userId).avatar}
              size="lg"
              className="rounded-xl border-2 border-purple-500"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-xs font-bold tracking-[0.2em] text-purple-400 uppercase">
                <Crown className="size-3.5" aria-hidden /> MVP do campeonato
              </div>
              <Link href={href(mvp.userId)} className="font-display text-2xl font-bold hover:text-brand">
                {person(mvp.userId).name}
              </Link>
              <div className="text-sm text-muted">
                {teamOfUser.get(mvp.userId)?.name ?? "-"} · rating {dec(mvp.rating)} · {mvp.k}/{mvp.a}/{mvp.d} · ADR{" "}
                {dec(mvp.adr, 1)} · {mvp.maps} {mvp.maps === 1 ? "mapa" : "mapas"}
              </div>
            </div>
          </div>
        </Card>
      )}

      <section>
        <h2 className="mb-3 font-display text-sm font-semibold tracking-wide text-muted uppercase">
          Líderes{" "}
          <span className="tracking-normal text-subtle normal-case">
            · médias com mínimo de {min} {min === 1 ? "mapa" : "mapas"}
          </span>
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {BOARDS.map((b) => (
            <Card key={b.key}>
              <CardHeader title={b.title} />
              <ol className="divide-y divide-border">
                {leaders(s.lines, b).map(({ line, value }, i) => (
                  <li key={line.key} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <span
                      className={i === 0 ? "w-4 font-display font-bold text-brand" : "w-4 font-display text-subtle"}
                    >
                      {i + 1}
                    </span>
                    <Avatar name={person(line.userId!).name} src={person(line.userId!).avatar} size="xs" />
                    <Link href={href(line.userId!)} className="min-w-0 flex-1 truncate font-medium hover:text-brand">
                      {person(line.userId!).name}
                    </Link>
                    <span className="font-semibold tabular">{b.format(value)}</span>
                  </li>
                ))}
              </ol>
            </Card>
          ))}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title="Melhor jogador por mapa" description="Maior rating no mapa" />
          <ul className="divide-y divide-border">
            {bestByMap(s.gc.map((g) => g.data)).map(({ mapId, games, best }) => (
              <li key={mapId} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <MapIcon id={mapId as MapId} size={22} />
                <span className="w-20 shrink-0 text-muted">
                  {mapName(mapId as MapId)} <span className="text-xs text-subtle">({games})</span>
                </span>
                <Link href={href(best!.userId!)} className="min-w-0 flex-1 truncate font-medium hover:text-brand">
                  {person(best!.userId!).name}
                </Link>
                <span className="font-semibold tabular">{dec(best!.rating)}</span>
              </li>
            ))}
          </ul>
        </Card>
        {teamBoards.map((b) => (
          <Card key={b.title}>
            <CardHeader title={b.title} description="Equipes, em todos os jogos decididos" />
            <ol className="divide-y divide-border">
              {b.rows.map((r, i) => (
                <li key={r.team.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className={i === 0 ? "w-4 font-display font-bold text-brand" : "w-4 font-display text-subtle"}>
                    {i + 1}
                  </span>
                  <TeamLogo team={r.team} size={24} />
                  <span className="min-w-0 flex-1 truncate font-medium">{r.team.name}</span>
                  <span className="font-semibold tabular">{b.value(r)}</span>
                </li>
              ))}
            </ol>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden">
        <CardHeader title="Todos os jogadores" description="Somados todos os mapas importados da GC" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-xs font-semibold text-muted">
                <th className="w-10 px-4 py-2.5 text-left">#</th>
                <th className="px-2 py-2.5 text-left">Jogador</th>
                <th className="px-2 py-2.5 text-left">Equipe</th>
                <th className="px-2 py-2.5 text-center">Mapas</th>
                <th className="px-2 py-2.5 text-center">K</th>
                <th className="px-2 py-2.5 text-center">D</th>
                <th className="px-2 py-2.5 text-center">A</th>
                <th className="px-2 py-2.5 text-center">K/D</th>
                <th className="px-2 py-2.5 text-center">ADR</th>
                <th className="px-2 py-2.5 text-center">HS%</th>
                <th className="px-4 py-2.5 text-center">Rating</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((l, i) => (
                <tr key={l.key} className="border-b border-border last:border-0 hover:bg-surface-2/50">
                  <td className="px-4 py-2 text-subtle tabular">{i + 1}</td>
                  <td className="px-2 py-2">
                    <Link href={href(l.userId!)} className="flex items-center gap-2 font-semibold hover:text-brand">
                      <Avatar name={person(l.userId!).name} src={person(l.userId!).avatar} size="xs" />
                      <span className="max-w-40 truncate">{person(l.userId!).name}</span>
                    </Link>
                  </td>
                  <td className="px-2 py-2 text-muted">{teamOfUser.get(l.userId!)?.name ?? "-"}</td>
                  <td className="px-2 py-2 text-center tabular">{l.maps}</td>
                  <td className="px-2 py-2 text-center tabular">{l.k}</td>
                  <td className="px-2 py-2 text-center tabular">{l.d}</td>
                  <td className="px-2 py-2 text-center tabular">{l.a}</td>
                  <td className="px-2 py-2 text-center font-semibold tabular">{dec(kdOf(l))}</td>
                  <td className="px-2 py-2 text-center tabular">{dec(l.adr, 1)}</td>
                  <td className="px-2 py-2 text-center tabular">
                    {l.hsRate == null ? "-" : `${Math.round(l.hsRate)}%`}
                  </td>
                  <td
                    className={cn(
                      "px-4 py-2 text-center font-display font-bold tabular",
                      (l.rating ?? 0) >= 1.1 ? "text-win" : (l.rating ?? 1) <= 0.9 ? "text-loss" : "",
                    )}
                  >
                    {dec(l.rating)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
