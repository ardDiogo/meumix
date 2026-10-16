import { SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DemoBadge } from "@/components/demo-notice";
import { PlayerSearch } from "@/components/layout/player-search";
import { PageHeader } from "@/components/page-header";
import { LevelBadge } from "@/components/players/level-badge";
import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { getDataSource } from "@/services";
import { searchPlayers } from "@/services/queries";
import { playerHref } from "@/lib/player-slug";

export const metadata: Metadata = { title: "Jogadores" };

export default async function PlayersPage({ searchParams }: PageProps<"/jogadores">) {
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.slice(0, 64) : "";
  const results = await searchPlayers(query);
  const kind = getDataSource().kind;

  return (
    <>
      <PageHeader
        title="Jogadores"
        description="Perfis, ELO e desempenho dos jogadores da comunidade."
        actions={<DemoBadge kind={kind} />}
      />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <PlayerSearch className="w-full sm:max-w-sm" defaultValue={query} />
        <p className="text-sm text-muted" aria-live="polite">
          {query ? `${results.length} resultado(s) para “${query}”` : `${results.length} jogadores`}
        </p>
      </div>

      {results.length ? (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {results.map(({ player, elo }) => (
            <li key={player.id}>
              <Link
                href={playerHref(player)}
                className="group flex items-center gap-3 rounded-lg border border-border bg-surface p-3 transition-colors hover:border-border-strong hover:bg-surface-2"
              >
                <Avatar name={player.nickname} src={player.avatarUrl} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium group-hover:text-brand">{player.nickname}</div>
                  <div className="text-xs text-muted">{player.steamId ? "Steam vinculada" : "Steam não vinculada"}</div>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-1.5">
                    <LevelBadge elo={elo} />
                    <span className="font-display text-lg font-bold tabular">{elo}</span>
                  </div>
                  <div className="text-[10px] tracking-wider text-subtle uppercase">ELO</div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Card>
          <EmptyState
            icon={SearchX}
            title="Nenhum jogador encontrado"
            description={`Não encontramos jogadores com “${query}”. Verifique a grafia do nickname.`}
            action={
              <Link href="/jogadores" className="text-sm font-medium text-brand hover:underline">
                Limpar busca
              </Link>
            }
          />
        </Card>
      )}
    </>
  );
}
