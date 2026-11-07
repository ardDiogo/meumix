import { CalendarDays, HelpCircle, Plus, Trophy, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { formatDateRange } from "@/components/championships/format";
import { ChampionshipStatusBadge } from "@/components/championships/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { canCreate, listChampionships } from "@/services/championships";

export const metadata: Metadata = { title: "Campeonatos" };

export default async function ChampionshipsPage() {
  const [{ list, missing }, admin] = await Promise.all([listChampionships(), canCreate()]);
  return (
    <>
      <PageHeader
        eyebrow="MeuMix Championship"
        title="Campeonatos"
        description="Times definidos por código ou formados por draft, fase classificatória, playoffs e premiação."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/campeonatos/como-funciona">
                <HelpCircle /> Como funciona
              </Link>
            </Button>
            {admin && !missing && (
              <Button variant="primary" asChild>
                <Link href="/campeonatos/novo">
                  <Plus /> Novo campeonato
                </Link>
              </Button>
            )}
          </>
        }
      />
      {missing && admin && (
        <Card className="mb-4 border-brand/40 p-4 text-sm text-muted">
          Para começar, rode a migração <code className="text-fg">0038_championships.sql</code> no SQL Editor do
          Supabase.
        </Card>
      )}
      {list.length === 0 ? (
        <Card>
          <EmptyState
            icon={Trophy}
            title="Nenhum campeonato ainda"
            description={
              admin ? "Crie o primeiro campeonato da comunidade." : "Quando houver um campeonato, ele aparece aqui."
            }
            action={
              <Button variant="ghost" size="sm" asChild>
                <Link href="/campeonatos/como-funciona">Entenda como funciona</Link>
              </Button>
            }
          />
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((c) => {
            const dates = formatDateRange(c.startsOn, c.endsOn);
            return (
              <li key={c.id}>
                <Link
                  href={`/campeonatos/${c.slug}`}
                  className="group block overflow-hidden rounded-lg border border-border bg-surface transition-colors hover:border-brand/60"
                >
                  <div className="relative h-32 overflow-hidden bg-gradient-to-br from-brand/25 via-surface-2 to-surface">
                    {c.hasBanner && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/api/campeonatos/${c.id}/banner?v=${encodeURIComponent(c.updatedAt)}`}
                        alt=""
                        loading="lazy"
                        className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-surface via-transparent to-transparent" />
                    <div className="absolute top-3 left-3">
                      <ChampionshipStatusBadge status={c.status} />
                    </div>
                  </div>
                  <div className="space-y-1.5 px-4 pt-1 pb-4">
                    {c.edition && (
                      <div className="text-[11px] font-medium tracking-wider text-muted uppercase">{c.edition}</div>
                    )}
                    <h2 className="font-display text-lg leading-tight font-bold group-hover:text-brand">{c.name}</h2>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                      <span className="flex items-center gap-1">
                        <Users className="size-3.5" aria-hidden /> {c.teamCount} equipes · {c.playersPerTeam}x
                        {c.playersPerTeam}
                      </span>
                      {dates && (
                        <span className="flex items-center gap-1">
                          <CalendarDays className="size-3.5" aria-hidden /> {dates}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
