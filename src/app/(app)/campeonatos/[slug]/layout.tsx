import { CalendarDays } from "lucide-react";
import { notFound } from "next/navigation";
import { ChampionshipStatusBadge } from "@/components/championships/status-badge";
import { ChampionshipTabs } from "@/components/championships/championship-tabs";
import { getChampionship } from "@/services/championships";
import { formatDateRange } from "@/components/championships/format";

/** Topo de todas as páginas do campeonato: capa, nome, status e abas. */
export default async function ChampionshipLayout({ children, params }: LayoutProps<"/campeonatos/[slug]">) {
  const { slug } = await params;
  const data = await getChampionship(slug);
  if (!data) notFound();
  const { championship: c, canManage } = data;
  const dates = formatDateRange(c.startsOn, c.endsOn);
  return (
    <>
      <div className="relative mb-4 overflow-hidden rounded-lg border border-border bg-surface">
        {c.hasBanner ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/campeonatos/${c.id}/banner?v=${encodeURIComponent(c.updatedAt)}`}
            alt=""
            className="absolute inset-0 size-full object-cover opacity-45"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-brand/25 via-transparent to-transparent" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/70 to-transparent" />
        <div className="relative flex min-h-36 flex-col justify-end gap-2 px-4 pt-10 pb-4 sm:min-h-44 sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <ChampionshipStatusBadge status={c.status} />
            {c.edition && <span className="text-xs font-medium tracking-wider text-muted uppercase">{c.edition}</span>}
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">{c.name}</h1>
          {dates && (
            <p className="flex items-center gap-1.5 text-sm text-muted">
              <CalendarDays className="size-4" aria-hidden /> {dates}
            </p>
          )}
        </div>
      </div>
      <ChampionshipTabs slug={c.slug} canManage={canManage} teamMode={c.teamMode} />
      <div className="mt-4">{children}</div>
    </>
  );
}
