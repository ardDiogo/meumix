import { Search, Trophy } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DemoBadge } from "@/components/demo-notice";
import { PageHeader } from "@/components/page-header";
import { Delta } from "@/components/stats/delta";
import { LevelBadge } from "@/components/players/level-badge";
import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDecimal, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getDataSource } from "@/services";
import { getRanking, parsePeriod, RANKING_PERIODS } from "@/services/queries";
import { playerHref } from "@/lib/player-slug";

export const metadata: Metadata = { title: "Rankings" };

export default async function RankingsPage({ searchParams }: PageProps<"/rankings">) {
  const sp = await searchParams;
  const period = parsePeriod(sp.periodo);
  const query = typeof sp.q === "string" ? sp.q.slice(0, 64) : "";
  const [{ kind, rows, total }, community] = await Promise.all([
    getRanking({ period, query }),
    getDataSource().getCommunity(),
  ]);

  const href = (p: string) => {
    const params = new URLSearchParams({ periodo: p });
    if (query) params.set("q", query);
    return `/rankings?${params}`;
  };

  return (
    <>
      <PageHeader
        eyebrow={community.name}
        title="Rankings"
        description="Classificação por ELO. Estatísticas e variação consideram apenas o período selecionado."
        actions={<DemoBadge kind={kind} />}
      />

      <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <FilterTabs
          label="Período do ranking"
          current={period}
          options={Object.entries(RANKING_PERIODS).map(([value, p]) => ({ value, label: p.label, href: href(value) }))}
        />
        <form action="/rankings" role="search" className="relative w-full md:max-w-xs">
          <input type="hidden" name="periodo" value={period} />
          <label htmlFor="ranking-search" className="sr-only">
            Buscar no ranking
          </label>
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle"
            aria-hidden
          />
          <input
            id="ranking-search"
            name="q"
            type="search"
            defaultValue={query}
            placeholder="Buscar no ranking…"
            className="h-9 w-full rounded-md border border-border bg-surface-2 pr-3 pl-9 text-sm placeholder:text-subtle hover:border-border-strong focus:border-brand focus:outline-none"
          />
        </form>
      </div>

      <Card>
        {rows.length ? (
          <Table>
            <THead>
              <TR>
                <TH className="w-14 text-center">#</TH>
                <TH className="min-w-44">Jogador</TH>
                <TH className="text-right">ELO</TH>
                <TH className="text-right" title="Variação de ELO no período">
                  Var.
                </TH>
                <TH className="text-right">Mixes</TH>
                <TH className="text-right" title="Vitórias">
                  V
                </TH>
                <TH className="text-right" title="Derrotas">
                  D
                </TH>
                <TH className="text-right">Win rate</TH>
                <TH className="text-right">K/D</TH>
                <TH className="text-right">ADR</TH>
              </TR>
            </THead>
            <tbody>
              {rows.map((r) => (
                <TR key={r.player.id} className="hover:bg-surface-2/50">
                  <TD className="text-center">
                    <span
                      className={cn(
                        "inline-flex size-7 items-center justify-center rounded-sm font-display text-sm font-bold tabular",
                        r.position === 1 && "bg-brand text-brand-fg",
                        r.position === 2 && "bg-brand/25 text-brand",
                        r.position === 3 && "bg-brand/12 text-brand",
                        r.position > 3 && "text-muted",
                      )}
                    >
                      {r.position}
                    </span>
                  </TD>
                  <TD>
                    <Link href={playerHref(r.player)} className="group flex items-center gap-2.5">
                      <Avatar name={r.player.nickname} src={r.player.avatarUrl} size="sm" />
                      <span className="font-medium group-hover:text-brand">{r.player.nickname}</span>
                    </Link>
                  </TD>
                  <TD className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <LevelBadge elo={r.elo} />
                      <span className="font-display text-base font-bold">{r.elo}</span>
                    </div>
                  </TD>
                  <TD className="text-right">
                    <Delta value={r.eloChange} />
                  </TD>
                  <TD className="text-right text-muted">{r.stats.mixes}</TD>
                  <TD className="text-right text-win">{r.stats.wins}</TD>
                  <TD className="text-right text-loss">{r.stats.losses}</TD>
                  <TD className="text-right">
                    <WinRate value={r.stats.winRate} />
                  </TD>
                  <TD className="text-right">{formatDecimal(r.stats.kd)}</TD>
                  <TD className="text-right">{formatDecimal(r.stats.adr, 1)}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState
            icon={Trophy}
            title={query ? "Nenhum jogador encontrado" : "Sem partidas no período"}
            description={
              query
                ? `Nenhum jogador do ranking corresponde a “${query}”.`
                : "Nenhum mix foi finalizado neste período. Tente um intervalo maior."
            }
          />
        )}
      </Card>
      <p className="mt-3 text-xs text-subtle">
        {total} jogadores classificados. Rankings separados por comunidade serão habilitados com o suporte a múltiplas
        comunidades.
      </p>
    </>
  );
}

function WinRate({ value }: { value: number }) {
  return (
    <div className="ml-auto flex w-24 items-center justify-end gap-2">
      <div className="hidden h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3 sm:block" aria-hidden>
        <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, value)}%` }} />
      </div>
      <span className="w-10 tabular">{formatPercent(value)}</span>
    </div>
  );
}
