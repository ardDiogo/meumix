import {
  Award,
  CalendarClock,
  Flag,
  KeyRound,
  LockKeyhole,
  LogIn,
  Settings,
  ShieldAlert,
  Swords,
  UsersRound,
} from "lucide-react";
import type { Metadata } from "next";
import { CreateMixForm } from "@/components/admin/create-mix-form";
import { ScheduleList } from "@/components/admin/schedule-list";
import { FeatureToggles } from "@/components/admin/feature-toggles";
import { PenaltiesPanel } from "@/components/admin/penalties-panel";
import { UsersTable } from "@/components/admin/users-table";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { StatusBadge } from "@/components/mixes/badges";
import { PageHeader } from "@/components/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { formatDateTime } from "@/lib/format";
import { mapName } from "@/lib/maps";
import { getDataSource } from "@/services";
import { listManagedUsers } from "@/services/admin-users";
import { getFeatures } from "@/services/features";
import { activePenalties } from "@/services/penalties";
import { getPermissions } from "@/services/auth";
import { listPendingFinalization, listSchedules } from "@/services/mix-events";

export const metadata: Metadata = { title: "Painel administrativo" };

const TABS = {
  mix: { label: "Controle de mix", icon: Swords },
  insignias: { label: "Insígnias", icon: Award },
  configuracoes: { label: "Configurações", icon: Settings },
  usuarios: { label: "Usuários", icon: UsersRound },
  punicoes: { label: "Punições", icon: ShieldAlert },
} as const;
type Tab = keyof typeof TABS;

export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  const { session, canManageMixes, canManageAdmins } = await getPermissions();

  if (!canManageMixes) {
    return (
      <Card>
        <EmptyState
          icon={LockKeyhole}
          title="Acesso restrito a administradores"
          description={
            session
              ? "Sua conta não tem permissão de administrador. Peça acesso ao super administrador."
              : "Entre com uma conta de administrador para gerenciar mixes."
          }
          action={
            !session && (
              <Button variant="primary" asChild>
                <Link href="/entrar?next=/admin">
                  <LogIn /> Entrar
                </Link>
              </Button>
            )
          }
        />
      </Card>
    );
  }

  const { aba } = await searchParams;
  const visibleTabs = (Object.keys(TABS) as Tab[]).filter(
    (t) => (t !== "usuarios" && t !== "punicoes") || canManageAdmins,
  );
  const tab: Tab = typeof aba === "string" && visibleTabs.includes(aba as Tab) ? (aba as Tab) : "mix";
  const [schedules, upcoming] = await Promise.all([
    listSchedules(),
    getDataSource().listMixes({ status: ["scheduled", "live"] }),
  ]);

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
        options={visibleTabs.map((value) => ({
          value,
          label: TABS[value].label,
          href: value === "mix" ? "/admin" : `/admin?aba=${value}`,
        }))}
      />

      {tab === "mix" && (
        <div className="grid gap-4 lg:grid-cols-[1fr_24rem]">
          <div className="space-y-4">
            <CreateMixForm />
            <PendingFinalization />
          </div>
          <Card className="self-start">
            <CardHeader title="Mixes ativos" />
            {schedules ? (
              <ScheduleList schedules={schedules} />
            ) : upcoming.length ? (
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
      {tab === "usuarios" && <UsersPanel />}
      {tab === "punicoes" && <PenaltiesTab />}
      {tab === "configuracoes" && (
        <Card>
          <CardHeader title="Funcionalidades" description="Ligue ou desligue recursos do mix." />
          <FeatureToggles values={await getFeatures()} />
        </Card>
      )}
    </>
  );
}

async function UsersPanel() {
  const result = await listManagedUsers();
  return (
    <Card>
      <CardHeader
        title="Usuários e administradores"
        description="Administradores podem criar e gerenciar mixes. Somente o super administrador concede ou remove esse papel."
      />
      {result.status === "ok" ? (
        result.users.length ? (
          <UsersTable users={result.users} />
        ) : (
          <EmptyState icon={UsersRound} title="Nenhum usuário cadastrado ainda" />
        )
      ) : (
        <EmptyState
          icon={KeyRound}
          title={
            result.status === "not_configured" ? "Gestão de usuários não configurada" : "Erro ao carregar usuários"
          }
          description={
            result.status === "not_configured"
              ? "Defina SUPABASE_SECRET_KEY nas variáveis de ambiente da Vercel para listar e gerenciar usuários."
              : result.message
          }
        />
      )}
    </Card>
  );
}

async function PenaltiesTab() {
  const [users, penalties] = await Promise.all([listManagedUsers(), activePenalties()]);
  const list = users.status === "ok" ? users.users : [];
  const names = new Map(list.map((u) => [u.id, u.displayName]));
  return (
    <PenaltiesPanel
      users={list.map((u) => ({ id: u.id, name: `${u.displayName} (${u.email})` }))}
      penalties={[...penalties.values()].map((p) => ({
        id: p.id,
        userName: names.get(p.userId) ?? "Jogador",
        delaySeconds: p.delaySeconds,
        reason: p.reason,
        expiresAt: p.expiresAt,
        createdAt: p.createdAt,
      }))}
    />
  );
}

async function PendingFinalization() {
  const pending = await listPendingFinalization();
  if (!pending.length) return null;
  return (
    <Card>
      <CardHeader
        title="Mixes para finalizar"
        description="Lance o placar e as estatísticas para atualizar o ELO e o ranking."
      />
      <ul className="divide-y divide-border">
        {pending.map((p) => {
          const [y, m, d] = p.date.split("-");
          return (
            <li key={`${p.scheduleId}-${p.date}`} className="flex items-center justify-between gap-3 px-4 py-3">
              <div>
                <div className="font-medium">
                  Mix de {d}/{m}/{y} {p.eventTime && <span className="text-muted">· {p.eventTime}</span>}
                </div>
                <div className="text-xs text-muted">{p.players} inscritos</div>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/admin/finalizar?agenda=${p.scheduleId}&data=${p.date}`}>
                  <Flag /> Finalizar
                </Link>
              </Button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
