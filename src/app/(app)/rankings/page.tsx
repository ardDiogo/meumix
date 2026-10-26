import { Search, Trophy } from "lucide-react";
import type { Metadata } from "next";
import { DemoBadge } from "@/components/demo-notice";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { RankingTable } from "@/components/rankings/ranking-table";
import { getDataSource } from "@/services";
import { getRanking, parsePeriod, RANKING_PERIODS } from "@/services/queries";

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
        description="Classificação por ELO. Estatísticas e variação consideram apenas o período selecionado. Clique no título de uma coluna para ordenar."
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
          <RankingTable rows={rows} />
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
