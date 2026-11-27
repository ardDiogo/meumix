import { Crosshair, Flame, Plus, ShieldCheck, Trophy, UserRoundX } from "lucide-react";
import { MyLastMix } from "@/components/dashboard/my-last-mix";
import { getLastMixSummary } from "@/services/last-mix";
import { getCurrentLeague } from "@/services/league";
import { leagueIdsWithMixToday } from "@/services/league-today";
import type { Metadata } from "next";
import Link from "next/link";
import { DemoBadge } from "@/components/demo-notice";
import { MixList } from "@/components/mixes/mix-list";
import { LevelBadge } from "@/components/players/level-badge";
import { NextMixPanel } from "@/components/registrations/next-mix-panel";
import { ChampionshipHome } from "@/components/championships/championship-home";
import { dashboardChampionships } from "@/services/championship-home";
import { HeroBanner } from "@/components/dashboard/hero-banner";
import { LiveNow } from "@/components/twitch/live-now";
import { PushPrompt } from "@/components/push/push-prompt";
import { pushConfigured } from "@/services/push";
import { Delta } from "@/components/stats/delta";
import { EloChart } from "@/components/stats/elo-chart";
import { FormStrip } from "@/components/stats/form-strip";
import { StatCard } from "@/components/stats/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { eloChangeSince, toEloSeries } from "@/lib/elo";
import { ELO_CAP, levelForElo, type LevelDef } from "@/lib/levels";
import { getLevels } from "@/services/levels";
import { formatDate, formatDecimal, formatPercent } from "@/lib/format";
import { mapName } from "@/lib/maps";
import { aggregatePlayer } from "@/lib/stats";
import { cn } from "@/lib/utils";
import { getDataSource } from "@/services";
import { getPermissions } from "@/services/auth";
import { getDashboard } from "@/services/queries";
import { mixHref } from "@/lib/mix-slug";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Acompanhe a lista, os times, o bolão e o resultado do mix.",
  openGraph: {
    title: "🧱 Alambrado do MeuMix",
    description: "Acompanhe a lista, os times, o bolão e o resultado do mix.",
    images: [{ url: "/brand/og-share.jpg", width: 1200, height: 630, alt: "MeuMix" }],
  },
};

const RECENT_WINDOW = 10;

export default async function DashboardPage() {
  const [{ kind, profile, highlights }, { session, canManageMixes }, championships, league, mixToday] =
    await Promise.all([
      getDashboard(),
      getPermissions(),
      // Campeonatos com inscrições abertas ou em andamento (sem as migrações: nenhum).
      dashboardChampionships().catch(() => []),
      getCurrentLeague(),
      leagueIdsWithMixToday().catch(() => new Set<string>()),
    ]);
  // O seu último mix no topo (no lugar do banner); em dia de mix, abaixo do "Participar do mix".
  const lastMix = await getLastMixSummary(session?.id ?? null);
  const isMixDay = !!league && !league.none && mixToday.has(league.id);
  // Só para quem jogou o último mix; os outros veem o banner de sempre.
  const mine = lastMix?.me ? lastMix : null;
  const carouselTop = mine && !isMixDay ? <MyLastMix data={mine} /> : null;
  const carouselBelow = mine && isMixDay ? <MyLastMix data={mine} compact /> : null;

  if (!profile || !highlights) {
    return (
      <>
        {carouselTop ?? (
          <HeroBanner
            eyebrow={session ? `Olá, ${session.displayName}` : "Mixes de CS2"}
            title="Bem-vindo ao MeuMix"
            description="Inscreva-se no próximo mix e acompanhe seu desempenho."
            actions={
              <Button variant="secondary" asChild>
                <Link href="/rankings">Ver ranking</Link>
              </Button>
            }
          />
        )}
        {session && pushConfigured() && <PushPrompt />}
        <LiveNow />
        <NextMixPanel />
        {carouselBelow}
        <ChampionshipHome items={championships} loggedIn={!!session} />
        <Card>
          <EmptyState
            icon={UserRoundX}
            title={session ? "Seu perfil ainda não foi encontrado" : "Entre para ver suas estatísticas"}
            description={
              session
                ? "Recarregue a página em instantes. Se persistir, fale com um administrador."
                : "Faça login ou crie sua conta para acompanhar ELO, nível e desempenho nos mixes."
            }
            action={
              !session && (
                <Button variant="primary" asChild>
                  <Link href="/entrar">Entrar</Link>
                </Button>
              )
            }
          />
        </Card>
      </>
    );
  }

  const ds = getDataSource();
  const { player, stats, elo, position, totalPlayers, eloHistory, recentMixes } = profile;

  const mixNames = new Map(recentMixes.map((r) => [r.mix.id, r.mix.name]));
  const series = toEloSeries(eloHistory, mixNames);
  const recent = recentMixes.slice(0, RECENT_WINDOW);
  const recentAgg = aggregatePlayer(
    player.id,
    recent.map((r) => r.mix),
  );
  const [levels, elos, players] = await Promise.all([getLevels(), ds.getElos(), ds.listPlayers()]);
  const nowMs = ds.now().getTime();
  // Quem está logo acima e logo abaixo no ranking da liga.
  const nickOf = new Map(players.map((p) => [p.id, p.nickname]));
  const ranked = [...elos.entries()].sort((x, y) => y[1] - x[1]);
  const at = ranked.findIndex(([id]) => id === player.id);
  const neighbor = (i: number) => {
    const r = at >= 0 ? ranked[i] : undefined;
    return r ? { position: i + 1, name: nickOf.get(r[0]) ?? "Jogador", gap: Math.abs(r[1] - elo) } : null;
  };
  const above = neighbor(at - 1);
  const below = neighbor(at + 1);
  const curLevel = levelForElo(elo, levels);
  const nextLevel = levels.find((l) => l.level === curLevel.level + 1) ?? null;
  // Seu K/A/D e o ±ELO em cada mix da lista.
  const eloOfMix = new Map(eloHistory.filter((h) => h.mixId).map((h) => [h.mixId, h.eloAfter - h.eloBefore]));
  const lines = new Map(
    recentMixes.map((r) => [
      r.mix.id,
      { k: r.kills, a: r.assists, d: r.deaths, eloDelta: eloOfMix.get(r.mix.id) ?? null },
    ]),
  );
  // Com a janela cobrindo todos os mixes, "vs. geral" seria sempre zero.
  const compareRecent = recent.length < stats.mixes;
  // Melhor partida recente sem repetir o mix do último MVP (aí vai a segunda melhor).
  const bestRecent =
    [...recent]
      .sort((a, b) => b.kills - b.deaths - (a.kills - a.deaths))
      .find((r) => r.mix.id !== highlights.lastMvp?.mix.id) ?? highlights.bestRecent;
  const lastMvpLine = highlights.lastMvp ? recentMixes.find((r) => r.mix.id === highlights.lastMvp!.mix.id) : null;
  const elo30d = eloChangeSince(eloHistory, new Date(ds.now().getTime() - 30 * 86_400_000));

  return (
    <>
      {carouselTop ?? (
        <HeroBanner
          eyebrow={session ? `Olá, ${session.displayName}` : undefined}
          title="Seu resumo competitivo"
          description="Inscreva-se no próximo mix, acompanhe seu ELO, nível e desempenho na comunidade."
          actions={
            <>
              {canManageMixes && (
                <Button variant="primary" asChild>
                  <Link href="/admin">
                    <Plus /> Novo mix
                  </Link>
                </Button>
              )}
              <Button variant="secondary" asChild>
                <Link href="/rankings">Ver ranking</Link>
              </Button>
              <DemoBadge kind={kind} />
            </>
          }
        />
      )}

      {session && pushConfigured() && <PushPrompt />}
      <LiveNow />
      <NextMixPanel />
      {carouselBelow}
      <ChampionshipHome items={championships} loggedIn={!!session} />

      {/* Resumo competitivo */}
      <section aria-label="Resumo competitivo" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="ELO"
          value={elo}
          accent
          hint={
            <span className="flex items-center gap-1">
              Nível {levelForElo(elo, levels).level} · <Delta value={elo30d} /> 30d
            </span>
          }
        />
        <StatCard label="Ranking" value={position ? `#${position}` : "—"} hint={`de ${totalPlayers} jogadores`} />
        <StatCard
          label="Win rate"
          value={formatPercent(stats.winRate)}
          hint={`${stats.wins}V${stats.draws ? ` · ${stats.draws}E` : ""} · ${stats.losses}D`}
        />
        <StatCard label="Mixes" value={stats.mixes} hint={`${stats.mvps} ${stats.mvps === 1 ? "MVP" : "MVPs"}`} />
        <StatCard label="K/D" value={formatDecimal(stats.kd)} hint={`${stats.kills} K · ${stats.deaths} D`} />
        <StatCard
          label="ADR"
          value={formatDecimal(stats.adr, 1)}
          hint={stats.kast != null ? `KAST ${formatPercent(stats.kast)}` : "Sem dados de dano"}
        />
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {/* Evolução */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Evolução do ELO"
            description={`${series.length} partidas registradas`}
            action={<DemoBadge kind={kind} />}
          />
          <CardContent className="pb-2">
            <EloChart data={series} nextLevel={nextLevel} />
          </CardContent>
          <div className="grid gap-4 border-t border-border p-4 sm:grid-cols-[1fr_auto]">
            <div>
              <div className="mb-2 flex flex-wrap items-baseline gap-x-2 text-[11px] font-semibold tracking-wider text-muted uppercase">
                Últimos {recent.length} resultados
                <span className="font-normal tracking-normal text-subtle normal-case">mais recente à direita →</span>
              </div>
              <FormStrip
                results={[...recent].reverse().map((r) => r.result)}
                titles={[...recent].reverse().map((r) => `${r.mix.name} · ${r.kills}/${r.assists}/${r.deaths}`)}
              />
            </div>
            <dl className="grid grid-cols-3 gap-4 text-right sm:gap-6">
              <RecentStat
                label="Win rate"
                value={formatPercent(recentAgg.winRate)}
                diff={compareRecent ? recentAgg.winRate - stats.winRate : null}
                unit="pp"
              />
              <RecentStat
                label="K/D"
                value={formatDecimal(recentAgg.kd)}
                diff={compareRecent ? recentAgg.kd - stats.kd : null}
              />
              <RecentStat
                label="ADR"
                value={formatDecimal(recentAgg.adr, 1)}
                diff={compareRecent && recentAgg.adr != null && stats.adr != null ? recentAgg.adr - stats.adr : null}
              />
            </dl>
          </div>
        </Card>

        {/* Destaques */}
        <Card>
          <CardHeader title="Destaques" description="Baseado nos seus mixes recentes" />
          <ul className="divide-y divide-border">
            <HighlightItem
              icon={Trophy}
              label="Último MVP"
              value={highlights.lastMvp ? highlights.lastMvp.mix.name : "Nenhum ainda"}
              detail={
                lastMvpLine
                  ? `${lastMvpLine.kills}/${lastMvpLine.assists}/${lastMvpLine.deaths} · ${formatDate(lastMvpLine.mix.scheduledAt)}`
                  : highlights.lastMvp
                    ? formatDate(highlights.lastMvp.mix.scheduledAt)
                    : undefined
              }
              href={highlights.lastMvp ? mixHref(highlights.lastMvp.mix) : undefined}
              accent={!!highlights.lastMvp}
            />
            <HighlightItem
              icon={Flame}
              label="Melhor partida recente (K/A/D)"
              value={bestRecent ? `${bestRecent.kills}/${bestRecent.assists}/${bestRecent.deaths}` : "—"}
              detail={
                bestRecent
                  ? `${bestRecent.mix.name} · ${bestRecent.mix.maps.map((m) => mapName(m.mapId)).join(", ")}`
                  : undefined
              }
              href={bestRecent ? mixHref(bestRecent.mix) : undefined}
            />
            <HighlightItem
              icon={ShieldCheck}
              label="Clutches vencidos"
              value={String(highlights.clutchesWon)}
              detail={`Nos últimos ${recent.length} ${recent.length === 1 ? "mix" : "mixes"} (placar e GC)`}
            />
            <HighlightItem
              icon={Crosshair}
              label="Primeiros abates"
              value={String(highlights.firstKills)}
              detail={
                recent.length
                  ? `Nos últimos ${recent.length} ${recent.length === 1 ? "mix" : "mixes"} · ${formatDecimal(highlights.firstKills / recent.length, 1)} por mix`
                  : undefined
              }
            />
          </ul>
        </Card>

        {/* Últimos mixes */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Últimos mixes"
            action={
              <Button variant="ghost" size="sm" asChild>
                <Link href="/mixes">Ver todos</Link>
              </Button>
            }
          />
          <MixList
            mixes={recentMixes.slice(0, 6).map((r) => r.mix)}
            perspectiveId={player.id}
            lines={lines}
            now={nowMs}
            compact
          />
        </Card>

        {/* Nível */}
        <LevelCard elo={elo} levels={levels} above={above} below={below} />
      </div>
    </>
  );
}

function RecentStat({
  label,
  value,
  diff,
  unit,
}: {
  label: string;
  value: string;
  diff: number | null;
  unit?: string;
}) {
  return (
    <div>
      <dt className="text-[11px] font-semibold tracking-wider text-muted uppercase">{label}</dt>
      <dd className="font-display text-lg font-bold tabular">{value}</dd>
      {diff != null && (
        <dd className={cn("text-[11px] tabular", diff > 0 ? "text-win" : diff < 0 ? "text-loss" : "text-muted")}>
          {diff > 0 ? "+" : diff < 0 ? "−" : ""}
          {formatDecimal(Math.abs(diff), unit ? 1 : 2)}
          {unit ? ` ${unit}` : ""} vs. geral
        </dd>
      )}
    </div>
  );
}

function HighlightItem({
  icon: Icon,
  label,
  value,
  detail,
  href,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  detail?: string;
  href?: string;
  accent?: boolean;
}) {
  const content = (
    <div className="flex items-center gap-3 px-4 py-3">
      <div
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-surface-2",
          accent ? "text-brand" : "text-muted",
        )}
      >
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-semibold tracking-wider text-muted uppercase">{label}</div>
        <div className="truncate font-medium text-fg">{value}</div>
        {detail && <div className="truncate text-xs text-subtle">{detail}</div>}
      </div>
    </div>
  );
  return (
    <li>
      {href ? (
        <Link href={href} className="block transition-colors hover:bg-surface-2">
          {content}
        </Link>
      ) : (
        content
      )}
    </li>
  );
}

type Neighbor = { position: number; name: string; gap: number } | null;

function LevelCard({
  elo,
  levels,
  above,
  below,
}: {
  elo: number;
  levels: LevelDef[];
  above: Neighbor;
  below: Neighbor;
}) {
  const current = levelForElo(elo, levels);
  const next = levels.find((l) => l.level === current.level + 1);
  const progress = next ? Math.round(((elo - current.min) / (next.min - current.min)) * 100) : 100;
  return (
    <Card>
      <CardHeader title="Seu nível" />
      <CardContent>
        <div className="flex items-center gap-4">
          <LevelBadge elo={elo} size="md" />
          <div className="min-w-0 flex-1">
            <div className="font-display text-lg font-bold">Nível {current.level}</div>
            <div className="text-sm text-muted tabular">
              {elo} de ELO {next ? `· faltam ${next.min - elo} para o nível ${next.level}` : "· nível máximo"}
            </div>
          </div>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-3" aria-hidden>
          <div className="h-full rounded-full" style={{ width: `${progress}%`, background: current.color }} />
        </div>
        <div className="mt-1.5 flex justify-between text-[11px] text-subtle tabular">
          <span>{current.min}</span>
          <span>{next ? next.min : ELO_CAP}</span>
        </div>
        {(above || below) && (
          <div className="mt-5 border-t border-border pt-4">
            <div className="mb-2 text-[11px] font-semibold tracking-wider text-muted uppercase">No ranking</div>
            <ul className="space-y-2 text-sm">
              {above && (
                <li className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate">
                    <span className="text-muted tabular">#{above.position}</span> {above.name}
                  </span>
                  <span className="shrink-0 text-xs text-muted tabular">
                    {above.gap === 0 ? (
                      "empatado com você"
                    ) : (
                      <>
                        <b className="text-loss">{above.gap}</b> de ELO acima
                      </>
                    )}
                  </span>
                </li>
              )}
              <li className="flex items-center justify-between gap-2 rounded-md bg-brand/10 px-2 py-1 font-semibold text-brand">
                <span>#{(above?.position ?? 0) + 1} Você</span>
                <span className="text-xs tabular">{elo}</span>
              </li>
              {below && (
                <li className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate">
                    <span className="text-muted tabular">#{below.position}</span> {below.name}
                  </span>
                  <span className="shrink-0 text-xs text-muted tabular">
                    {below.gap === 0 ? (
                      "empatado com você"
                    ) : (
                      <>
                        <b className="text-win">{below.gap}</b> de ELO abaixo
                      </>
                    )}
                  </span>
                </li>
              )}
            </ul>
            {above && above.gap > 0 && (
              <p className="mt-3 text-xs text-muted">
                Mais <b className="text-fg">{above.gap + 1}</b> de ELO e você passa {above.name}.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
