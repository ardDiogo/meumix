import { Crosshair, Flame, Plus, ShieldCheck, Trophy, UserRoundX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DemoBadge } from "@/components/demo-notice";
import { MixList } from "@/components/mixes/mix-list";
import { LevelBadge } from "@/components/players/level-badge";
import { NextMixPanel } from "@/components/registrations/next-mix-panel";
import { PageHeader } from "@/components/page-header";
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

export const metadata: Metadata = { title: "Dashboard" };

const RECENT_WINDOW = 10;

export default async function DashboardPage() {
  const [{ kind, profile, highlights }, { session, canManageMixes }] = await Promise.all([
    getDashboard(),
    getPermissions(),
  ]);

  if (!profile || !highlights) {
    return (
      <>
        <PageHeader
          eyebrow={session ? `Olá, ${session.displayName}` : undefined}
          title="Dashboard"
          description="Inscreva-se no próximo mix e acompanhe seu desempenho."
        />
        <NextMixPanel />
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
  const levels = await getLevels();
  const elo30d = eloChangeSince(eloHistory, new Date(ds.now().getTime() - 30 * 86_400_000));

  return (
    <>
      <PageHeader
        eyebrow={session ? `Olá, ${session.displayName}` : undefined}
        title="Dashboard"
        description="Seu resumo competitivo na comunidade."
        actions={
          <>
            <DemoBadge kind={kind} />
            {canManageMixes && (
              <Button variant="primary" asChild>
                <Link href="/admin">
                  <Plus /> Novo mix
                </Link>
              </Button>
            )}
          </>
        }
      />

      <NextMixPanel />

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
        <StatCard label="Win rate" value={formatPercent(stats.winRate)} hint={`${stats.wins}V · ${stats.losses}D`} />
        <StatCard label="Mixes" value={stats.mixes} hint={`${stats.mvps} MVPs`} />
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
            <EloChart data={series} />
          </CardContent>
          <div className="grid gap-4 border-t border-border p-4 sm:grid-cols-[1fr_auto]">
            <div>
              <div className="mb-2 text-[11px] font-semibold tracking-wider text-muted uppercase">
                Últimos {recent.length} resultados
              </div>
              <FormStrip results={[...recent].reverse().map((r) => r.result)} />
            </div>
            <dl className="grid grid-cols-3 gap-4 text-right sm:gap-6">
              <RecentStat
                label="Win rate"
                value={formatPercent(recentAgg.winRate)}
                diff={recentAgg.winRate - stats.winRate}
                unit="pp"
              />
              <RecentStat label="K/D" value={formatDecimal(recentAgg.kd)} diff={recentAgg.kd - stats.kd} />
              <RecentStat
                label="ADR"
                value={formatDecimal(recentAgg.adr, 1)}
                diff={recentAgg.adr != null && stats.adr != null ? recentAgg.adr - stats.adr : null}
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
              detail={highlights.lastMvp ? formatDate(highlights.lastMvp.mix.scheduledAt) : undefined}
              href={highlights.lastMvp ? `/mixes/${highlights.lastMvp.mix.id}` : undefined}
              accent={!!highlights.lastMvp}
            />
            <HighlightItem
              icon={Flame}
              label="Melhor partida recente (K/A/D)"
              value={
                highlights.bestRecent
                  ? `${highlights.bestRecent.kills}/${highlights.bestRecent.assists}/${highlights.bestRecent.deaths}`
                  : "—"
              }
              detail={
                highlights.bestRecent
                  ? `${highlights.bestRecent.mix.name} · ${highlights.bestRecent.mix.maps.map((m) => mapName(m.mapId)).join(", ")}`
                  : undefined
              }
              href={highlights.bestRecent ? `/mixes/${highlights.bestRecent.mix.id}` : undefined}
            />
            <HighlightItem
              icon={ShieldCheck}
              label="Clutches vencidos"
              value={String(highlights.clutchesWon)}
              detail="Quando registrados"
            />
            <HighlightItem
              icon={Crosshair}
              label="Primeiros abates"
              value={String(highlights.firstKills)}
              detail="Quando registrados"
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
          <MixList mixes={recentMixes.slice(0, 6).map((r) => r.mix)} perspectiveId={player.id} compact />
        </Card>

        {/* Nível */}
        <LevelCard elo={elo} levels={levels} />
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

function LevelCard({ elo, levels }: { elo: number; levels: LevelDef[] }) {
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
      </CardContent>
    </Card>
  );
}
