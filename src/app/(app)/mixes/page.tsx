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
  const [{ kind, mixes }, { canManageMixes }] = await Promise.all([listMixes(), getPermissions()]);
  const visible = mixes.filter((m) => FILTERS[filter].match(m.status));

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
          count: mixes.filter((m) => f.match(m.status)).length,
        }))}
      />
      <Card>
        <MixList mixes={visible} />
      </Card>
    </>
  );
}
