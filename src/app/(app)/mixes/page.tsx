import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DemoBadge } from "@/components/demo-notice";
import { MixList } from "@/components/mixes/mix-list";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { getPermissions } from "@/services/auth";
import { listMixes } from "@/services/queries";
import { listUpcomingOccurrences } from "@/services/mix-events";
import { UpcomingList } from "@/components/mixes/upcoming-list";
import { DeleteMatchButton } from "@/components/mixes/delete-match-button";
import { CardHeader } from "@/components/ui/card";
import type { MixLine } from "@/components/mixes/mix-list";
import { playerMixResult } from "@/lib/stats";
import { getDataSource } from "@/services";

export const metadata: Metadata = { title: "Mixes" };

const FILTERS = {
  todos: { label: "Todos", match: () => true },
  finalizados: { label: "Finalizados", match: (s: string) => s === "finished" },
  agendados: { label: "Agendados", match: (s: string) => s === "scheduled" || s === "live" },
} as const;
type Filter = keyof typeof FILTERS;

export default async function MixesPage({ searchParams }: PageProps<"/mixes">) {
  const { status } = await searchParams;
  const filter: Filter = typeof status === "string" && status in FILTERS ? (status as Filter) : "todos";
  const [{ kind, mixes, players }, { canManageMixes, session }, upcoming] = await Promise.all([
    listMixes(),
    getPermissions(),
    listUpcomingOccurrences(),
  ]);
  const viewerId = session?.id ?? null;
  // Do seu ponto de vista: o seu K/A/D e o ±ELO em cada mix que você jogou.
  const history = viewerId
    ? await getDataSource()
        .getEloHistory(viewerId)
        .catch(() => [])
    : [];
  const eloOfMix = new Map(history.filter((h) => h.mixId).map((h) => [h.mixId, h.eloAfter - h.eloBefore]));
  const lines = new Map<string, MixLine>();
  if (viewerId)
    for (const m of mixes) {
      const r = playerMixResult(m, viewerId);
      if (r) lines.set(m.id, { k: r.kills, a: r.assists, d: r.deaths, eloDelta: eloOfMix.get(m.id) ?? null });
    }
  const nicknames = new Map([...players.values()].map((p) => [p.id, p.nickname]));
  const now = new Date();
  const visible = mixes.filter((m) => FILTERS[filter].match(m.status));
  // Agendados vêm das agendas criadas no admin (no banco real); no demo, dos próprios mixes.
  const scheduled = kind === "supabase" ? upcoming : [];
  const count = (f: Filter) =>
    mixes.filter((m) => FILTERS[f].match(m.status)).length + (f === "finalizados" ? 0 : scheduled.length);

  return (
    <>
      <PageHeader
        title="Mixes"
        description="Partidas organizadas pela comunidade, com placares e estatísticas individuais."
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
      <FilterTabs
        className="mb-3"
        label="Filtrar mixes por status"
        current={filter}
        options={Object.entries(FILTERS).map(([value, f]) => ({
          value,
          label: f.label,
          href: value === "todos" ? "/mixes" : `/mixes?status=${value}`,
          count: count(value as Filter),
        }))}
      />
      {kind === "supabase" && filter !== "finalizados" && (
        <Card className="mb-4">
          <CardHeader
            title="Próximos mixes"
            description="Mixes agendados. A inscrição abre no horário indicado."
            action={
              scheduled.length > 0 ? (
                <Button variant="primary" size="sm" asChild>
                  <Link href="/dashboard">Inscrever-se →</Link>
                </Button>
              ) : undefined
            }
          />
          <UpcomingList items={scheduled} now={now} />
        </Card>
      )}
      {(kind !== "supabase" || filter !== "agendados") && (
        <Card>
          {kind === "supabase" && <CardHeader title="Histórico de mixes" />}
          <MixList
            mixes={kind === "supabase" ? visible.filter((m) => m.status === "finished") : visible}
            perspectiveId={viewerId ?? undefined}
            lines={lines}
            players={nicknames}
            now={now.getTime()}
            groupByMonth
            action={
              canManageMixes && kind === "supabase"
                ? (mix) => <DeleteMatchButton matchId={mix.id} label={mix.name} subtle />
                : undefined
            }
          />
        </Card>
      )}
    </>
  );
}
