import { SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DemoBadge } from "@/components/demo-notice";
import { PlayerSearch } from "@/components/layout/player-search";
import { PageHeader } from "@/components/page-header";
import { LevelBadge } from "@/components/players/level-badge";
import { PlayerFilters } from "@/components/players/player-filters";
import { PLAYER_SORTS, type PlayerSort } from "@/lib/player-sorts";
import { FormStrip } from "@/components/stats/form-strip";
import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { getDataSource } from "@/services";
import { getSession } from "@/services/auth";
import { getLevels } from "@/services/levels";
import { searchPlayers } from "@/services/queries";
import { eloChangeSince } from "@/lib/elo";
import { formatDecimal, formatPercent } from "@/lib/format";
import { levelForElo } from "@/lib/levels";
import { playerHref } from "@/lib/player-slug";
import { aggregatePlayer, playerResult } from "@/lib/stats";
import { cn } from "@/lib/utils";
import { BadgeIcon } from "@/components/badges/badge-icon";
import { playerBadges } from "@/services/badges";

export const metadata: Metadata = { title: "Jogadores" };

const DAY = 86_400_000;
/** Sem jogar há mais que isso: o card fica apagado. */
const INACTIVE_DAYS = 30;
const MAX_BADGES = 3;

export default async function PlayersPage({ searchParams }: PageProps<"/jogadores">) {
  const { q, ordem, nivel } = await searchParams;
  const query = typeof q === "string" ? q.slice(0, 64) : "";
  const sort: PlayerSort = typeof ordem === "string" && ordem in PLAYER_SORTS ? (ordem as PlayerSort) : "elo";
  const levelFilter = typeof nivel === "string" && /^([1-9]|10)$/.test(nivel) ? Number(nivel) : null;
  const ds = getDataSource();
  const [all, granted, mixes, history, levels, session] = await Promise.all([
    searchPlayers(""),
    playerBadges(),
    ds.listMixes({ status: "finished" }),
    ds.getEloHistory().catch(() => []),
    getLevels(),
    getSession().catch(() => null),
  ]);
  const badgesOf = new Map<string, typeof granted>();
  for (const b of granted) badgesOf.set(b.userId, [...(badgesOf.get(b.userId) ?? []), b]);
  const now = ds.now().getTime();
  const since30 = new Date(now - 30 * DAY);
  const historyOf = new Map<string, typeof history>();
  for (const h of history) historyOf.set(h.playerId, [...(historyOf.get(h.playerId) ?? []), h]);
  // Mais recente primeiro (forma e último mix).
  const byDate = [...mixes].sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt));

  // Posição pelo ELO entre todos (antes da busca e dos filtros).
  const rows = all.map(({ player, elo }, i) => {
    const played = byDate.filter((m) => m.teams.some((t) => t.playerIds.includes(player.id)));
    const form = played
      .slice(0, 5)
      .map((m) => playerResult(m, player.id))
      .filter((r): r is "win" | "loss" | "draw" => r !== null)
      .reverse();
    const last = played[0]?.scheduledAt ?? null;
    return {
      player,
      elo,
      position: i + 1,
      stats: aggregatePlayer(player.id, played),
      form,
      formTitles: played
        .slice(0, 5)
        .map((m) => m.name)
        .reverse(),
      elo30: eloChangeSince(historyOf.get(player.id) ?? [], since30),
      daysOff: last ? Math.floor((now - new Date(last).getTime()) / DAY) : null,
      level: levelForElo(elo, levels).level,
    };
  });

  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const qn = norm(query);
  const sorters: Record<PlayerSort, (a: (typeof rows)[number], b: (typeof rows)[number]) => number> = {
    elo: (a, b) => a.position - b.position,
    wr: (a, b) => b.stats.winRate - a.stats.winRate || a.position - b.position,
    kdr: (a, b) => b.stats.kd - a.stats.kd || a.position - b.position,
    mixes: (a, b) => b.stats.mixes - a.stats.mixes || a.position - b.position,
    forma: (a, b) => b.elo30 - a.elo30 || a.position - b.position,
    nome: (a, b) => a.player.nickname.localeCompare(b.player.nickname, "pt-BR"),
  };
  const results = rows
    .filter((r) => (!qn || norm(r.player.nickname).includes(qn)) && (levelFilter == null || r.level === levelFilter))
    .sort(sorters[sort]);
  const keep = Object.fromEntries(
    [
      ["ordem", sort === "elo" ? "" : sort],
      ["nivel", levelFilter ? String(levelFilter) : ""],
    ].filter(([, v]) => v),
  );
  const filtered = !!query || levelFilter != null;

  return (
    <>
      <PageHeader
        title="Jogadores"
        description="Perfis, ELO e desempenho dos jogadores da comunidade."
        actions={<DemoBadge kind={ds.kind} />}
      />
      <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <PlayerSearch className="w-full sm:max-w-sm" defaultValue={query} keep={keep} />
          <PlayerFilters sort={sort} level={levelFilter} />
        </div>
        <p className="text-sm text-muted" aria-live="polite">
          {filtered ? `${results.length} de ${rows.length} jogadores` : `${rows.length} jogadores`}
          {query ? ` para “${query}”` : ""}
        </p>
      </div>

      {results.length ? (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {results.map((r) => {
            const { player, elo, stats } = r;
            const me = session?.id === player.id;
            const inactive = r.daysOff != null && r.daysOff > INACTIVE_DAYS;
            const badges = badgesOf.get(player.id) ?? [];
            return (
              <li key={player.id}>
                <Link
                  href={playerHref(player)}
                  className={cn(
                    "group flex h-full flex-col gap-2 rounded-lg border bg-surface p-3 transition-colors hover:border-border-strong hover:bg-surface-2",
                    me ? "border-brand/60 bg-brand/5 shadow-[0_0_18px_-8px] shadow-brand/60" : "border-border",
                    inactive && !me && "opacity-60 hover:opacity-100",
                  )}
                >
                  <div className="flex items-center gap-3">
                    <Avatar name={player.nickname} src={player.avatarUrl} size="md" />
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className="shrink-0 text-xs text-subtle tabular">#{r.position}</span>
                        <span className="truncate font-medium group-hover:text-brand">{player.nickname}</span>
                        {me && (
                          <span className="shrink-0 rounded bg-brand/15 px-1 text-[10px] font-bold text-brand uppercase">
                            você
                          </span>
                        )}
                      </div>
                      {badges.length > 0 && (
                        <div className="mt-0.5 flex items-center gap-1">
                          {badges.slice(0, MAX_BADGES).map((b) => (
                            <BadgeIcon key={b.id} icon={b.icon} color={b.color} size="xs" title={b.name} />
                          ))}
                          {badges.length > MAX_BADGES && (
                            <span
                              className="text-[11px] font-semibold text-muted"
                              title={badges
                                .slice(MAX_BADGES)
                                .map((b) => b.name)
                                .join(", ")}
                            >
                              +{badges.length - MAX_BADGES}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-1.5">
                        <LevelBadge elo={elo} />
                        <span className="font-display text-lg font-bold tabular">{elo}</span>
                      </div>
                      <div
                        className={cn(
                          "text-[10px] tracking-wider uppercase tabular",
                          r.elo30 > 0 ? "text-win" : r.elo30 < 0 ? "text-loss" : "text-subtle",
                        )}
                        title="Variação de ELO nos últimos 30 dias"
                      >
                        {r.elo30 > 0 ? `↗ +${r.elo30}` : r.elo30 < 0 ? `↘ −${Math.abs(r.elo30)}` : "ELO"}
                      </div>
                    </div>
                  </div>
                  <div className="mt-auto flex items-center justify-between gap-2 border-t border-border/60 pt-2">
                    <span className="truncate text-xs text-muted tabular">
                      {stats.mixes} {stats.mixes === 1 ? "mix" : "mixes"} · {formatPercent(stats.winRate)} ·{" "}
                      {formatDecimal(stats.kd)} KDR
                    </span>
                    {inactive ? (
                      <span className="shrink-0 text-[11px] text-subtle">último mix há {r.daysOff} dias</span>
                    ) : (
                      r.form.length > 0 && (
                        <FormStrip
                          results={r.form}
                          titles={r.formTitles}
                          className="shrink-0 flex-nowrap [&>li]:size-4 [&>li]:text-[9px]"
                        />
                      )
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <Card>
          <EmptyState
            icon={SearchX}
            title="Nenhum jogador encontrado"
            description={
              query
                ? `Não encontramos jogadores com “${query}”${levelFilter ? ` no nível ${levelFilter}` : ""}. Verifique a grafia do nickname.`
                : `Nenhum jogador no nível ${levelFilter}.`
            }
            action={
              <Link href="/jogadores" className="text-sm font-medium text-brand hover:underline">
                Limpar filtros
              </Link>
            }
          />
        </Card>
      )}
    </>
  );
}
