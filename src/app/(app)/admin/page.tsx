import { Award, CalendarClock, LockKeyhole, Settings, Swords } from "lucide-react";
import type { Metadata } from "next";
import { CreateMixForm } from "@/components/admin/create-mix-form";
import Link from "next/link";
import { StatusBadge } from "@/components/mixes/badges";
import { PageHeader } from "@/components/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { formatDateTime } from "@/lib/format";
import { mapName } from "@/lib/maps";
import { getDataSource } from "@/services";
import { getPermissions } from "@/services/auth";

export const metadata: Metadata = { title: "Painel administrativo" };

const TABS = {
  mix: { label: "Controle de mix", icon: Swords },
  insignias: { label: "Insígnias", icon: Award },
  configuracoes: { label: "Configurações", icon: Settings },
} as const;
type Tab = keyof typeof TABS;

export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  const { canManageMixes } = await getPermissions();

  if (!canManageMixes) {
    return (
      <Card>
        <EmptyState
          icon={LockKeyhole}
          title="Acesso restrito a administradores"
          description="Entre com uma conta de administrador para gerenciar mixes. O login ainda não está disponível nesta versão."
        />
      </Card>
    );
  }

  const { aba } = await searchParams;
  const tab: Tab = typeof aba === "string" && aba in TABS ? (aba as Tab) : "mix";
  const upcoming = await getDataSource().listMixes({ status: ["scheduled", "live"] });

  return (
    <>
      <PageHeader
        title="Painel administrativo"
        description="Gerencie mixes, insígnias e configurações da comunidade."
      />
      <FilterTabs
        className="mb-4"
        label="Seções do painel"
        current={tab}
        options={Object.entries(TABS).map(([value, t]) => ({
          value,
          label: t.label,
          href: value === "mix" ? "/admin" : `/admin?aba=${value}`,
        }))}
      />

      {tab === "mix" && (
        <div className="grid gap-4 lg:grid-cols-[1fr_24rem]">
          <CreateMixForm />
          <Card className="self-start">
            <CardHeader title="Mixes agendados" />
            {upcoming.length ? (
              <ul className="divide-y divide-border">
                {upcoming.map((m) => (
                  <li key={m.id}>
                    <Link href={`/mixes/${m.id}`} className="block px-4 py-3 transition-colors hover:bg-surface-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{m.name}</span>
                        <StatusBadge status={m.status} />
                      </div>
                      <div className="mt-0.5 text-xs text-muted">
                        {formatDateTime(m.scheduledAt)} · {m.maps.map((x) => mapName(x.mapId)).join(", ")}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={CalendarClock} title="Nenhum mix agendado" className="py-8" />
            )}
          </Card>
        </div>
      )}
      {tab === "insignias" && (
        <Card>
          <EmptyState
            icon={Award}
            title="Insígnias ainda não implementadas"
            description="Aqui você poderá criar insígnias e concedê-las aos jogadores por conquistas nos mixes."
          />
        </Card>
      )}
      {tab === "configuracoes" && (
        <Card>
          <EmptyState
            icon={Settings}
            title="Configurações da comunidade em breve"
            description="Pool de mapas, ELO inicial, tamanho dos times e administradores da comunidade."
          />
        </Card>
      )}
    </>
  );
}
