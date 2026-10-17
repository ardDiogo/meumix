import {
  Award,
  CalendarClock,
  Flag,
  KeyRound,
  Plug,
  Map as MapIcon,
  Music,
  ScrollText,
  LockKeyhole,
  LogIn,
  Settings,
  ShieldAlert,
  Swords,
  Trophy,
  UsersRound,
} from "lucide-react";
import type { Metadata } from "next";
import { cache } from "react";
import { BulkUsersForm } from "@/components/admin/bulk-users-form";
import { BulkConfirmLinks } from "@/components/admin/bulk-confirm-links";
import { AuditLogTable } from "@/components/admin/audit-log-table";
import { BadgesAdmin } from "@/components/admin/badges-admin";
import { AUDIT_CATEGORIES } from "@/lib/audit-labels";
import { listAuditLog } from "@/services/audit-log";
import { listBadges, playerBadges } from "@/services/badges";
import { CreateMixForm } from "@/components/admin/create-mix-form";
import { DeleteMixButton } from "@/components/admin/delete-mix-button";
import { FinalizeSection } from "@/components/admin/finalize-section";
import { GcExample } from "@/components/admin/gc-example";
import { LevelsEditor } from "@/components/admin/levels-editor";
import { MapsManager } from "@/components/admin/maps-manager";
import { MusicSettings } from "@/components/admin/music-settings";
import { CsrepApiPanel } from "@/components/admin/csrep-api-panel";
import { csrepApiConfigured } from "@/lib/integrations/csrep-api";
import { ScheduleList } from "@/components/admin/schedule-list";
import { FeatureToggles } from "@/components/admin/feature-toggles";
import { PenaltiesPanel } from "@/components/admin/penalties-panel";
import { UsersTable } from "@/components/admin/users-table";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { StatusBadge } from "@/components/mixes/badges";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { formatDateTime } from "@/lib/format";
import { mapName } from "@/lib/maps";
import { getDataSource } from "@/services";
import { listManagedUsers } from "@/services/admin-users";
import { getFeatures } from "@/services/features";
import { activePenalties, penaltyHistory } from "@/services/penalties";
import { getLevels } from "@/services/levels";
import { listAllMaps } from "@/services/maps";
import { getAppSetting } from "@/services/settings";
import { getPermissions } from "@/services/auth";
import { getNextMix, listPendingFinalization, listSchedules } from "@/services/mix-events";
import { MapIcon as MapEmblem } from "@/components/maps/map-icon";

export const metadata: Metadata = { title: "Painel administrativo" };
// A leitura dos prints por IA (finalização no painel) pode levar alguns segundos por imagem.
export const maxDuration = 60;

const TABS = {
  mix: { label: "Controle de mix", icon: Swords },
  insignias: { label: "Insígnias", icon: Award },
  configuracoes: { label: "Configurações", icon: Settings },
  usuarios: { label: "Jogadores", icon: UsersRound },
  logs: { label: "Logs", icon: ScrollText },
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

  const params = await searchParams;
  const rawTab = params.aba;
  // Punições agora ficam em Configurações (links antigos continuam funcionando).
  const aba = rawTab === "punicoes" ? "configuracoes" : rawTab;
  const visibleTabs = Object.keys(TABS) as Tab[];
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
        <div className="space-y-4">
          <CurrentMix viewerId={session!.id} />
          <GcExample />
          <div className="grid gap-4 lg:grid-cols-[1fr_24rem]">
            <div className="space-y-4">
              <CreateMixForm />
              <PendingFinalization viewerId={session!.id} />
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
                          {formatDateTime(m.scheduledAt)} ·{" "}
                          {m.maps.map((x) => (
                            <span key={x.order} className="mr-1.5 inline-flex items-center gap-1 align-middle">
                              <MapEmblem id={x.mapId} size={14} />
                              {mapName(x.mapId)}
                            </span>
                          ))}
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
        </div>
      )}
      {tab === "insignias" && <BadgesTab />}
      {tab === "logs" && (
        <LogsTab
          categoria={typeof params.categoria === "string" ? params.categoria : undefined}
          resultado={typeof params.resultado === "string" ? params.resultado : undefined}
          jogador={typeof params.jogador === "string" ? params.jogador : undefined}
          pagina={typeof params.pagina === "string" ? Number(params.pagina) || 1 : 1}
        />
      )}
      {tab === "usuarios" && (
        <div className="space-y-4">
          {canManageAdmins && <BulkUsersForm />}
          <UsersPanel canManageAdmins={canManageAdmins} currentUserId={session!.id} />
        </div>
      )}
      {tab === "configuracoes" && <SettingsTab canManageAdmins={canManageAdmins} />}
    </>
  );
}

async function UsersPanel({ canManageAdmins, currentUserId }: { canManageAdmins: boolean; currentUserId: string }) {
  const result = await listManagedUsers();
  return (
    <Card>
      <CardHeader
        title="Jogadores cadastrados"
        description="Edite dados e Steam, ajuste o ELO, redefina a senha ou exclua contas. Somente o master concede ou remove o papel de administrador e altera outros administradores."
        action={<BulkConfirmLinks />}
      />
      {result.status === "ok" ? (
        result.users.length ? (
          <UsersTable users={result.users} canManageAdmins={canManageAdmins} currentUserId={currentUserId} />
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

async function BadgesTab() {
  const [badges, granted, players] = await Promise.all([listBadges(), playerBadges(), getDataSource().listPlayers()]);
  if (!badges) {
    return (
      <Card>
        <EmptyState
          icon={Award}
          title="Insígnias não configuradas"
          description="Rode a migração 0015_badges.sql no Supabase para criar e conceder insígnias."
        />
      </Card>
    );
  }
  return (
    <BadgesAdmin
      badges={badges}
      granted={granted}
      players={players.map((p) => ({ id: p.id, name: p.nickname })).sort((a, b) => a.name.localeCompare(b.name))}
    />
  );
}

async function LogsTab({
  categoria,
  resultado,
  jogador,
  pagina,
}: {
  categoria?: string;
  resultado?: string;
  jogador?: string;
  pagina: number;
}) {
  const category = categoria && categoria in AUDIT_CATEGORIES ? categoria : undefined;
  const outcome = resultado === "sucesso" ? "success" : resultado === "recusado" ? "other" : undefined;
  const actorId = jogador && /^[0-9a-f-]{36}$/i.test(jogador) ? jogador : undefined;
  const [result, players] = await Promise.all([
    listAuditLog({ category, outcome, actorId, page: pagina }),
    getDataSource().listPlayers(),
  ]);
  if (!result) {
    return (
      <Card>
        <EmptyState
          icon={ScrollText}
          title="Logs indisponíveis"
          description="Defina SUPABASE_SECRET_KEY na Vercel para ver os logs."
        />
      </Card>
    );
  }
  return (
    <AuditLogTable
      rows={result.rows}
      names={result.names}
      hasMore={result.hasMore}
      page={pagina}
      filters={{ categoria: category, resultado, jogador: actorId }}
      players={players.map((p) => ({ id: p.id, name: p.nickname })).sort((a, b) => a.name.localeCompare(b.name))}
    />
  );
}

async function SettingsTab({ canManageAdmins }: { canManageAdmins: boolean }) {
  const [features, musicUrl, maps, levels] = await Promise.all([
    getFeatures(),
    getAppSetting("music_url"),
    listAllMaps(),
    getLevels(),
  ]);
  const title = (Icon: typeof Settings, text: string, className?: string) => (
    <span className="flex items-center gap-2">
      <Icon className={className ?? "size-4 text-muted"} aria-hidden /> {text}
    </span>
  );
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title={title(UsersRound, "Funcionalidades do mix")}
          description="Ative ou desative funcionalidades do mix."
        />
        <FeatureToggles values={features} />
      </Card>
      <Card>
        <CardHeader
          title={title(Music, "Música de fundo")}
          description="Toca automaticamente uma música ao abrir o site. Alguns navegadores exigem um clique inicial antes de liberar o áudio."
        />
        <MusicSettings enabled={features.background_music} url={musicUrl} />
      </Card>
      {canManageAdmins && (
        <div>
          <h2 className="mb-2 flex items-center gap-2 font-display text-lg font-bold">
            <ShieldAlert className="size-5 text-loss" aria-hidden /> Punições
          </h2>
          <p className="mb-3 text-sm text-muted">Aplique um delay de inscrição como punição a jogadores específicos.</p>
          <PenaltiesSection />
        </div>
      )}
      <Card>
        <CardHeader
          title={title(MapIcon, "Gerenciamento de mapas")}
          description="Configure os mapas disponíveis para votação nos mixes. Arraste para reordenar."
        />
        {maps.length ? (
          <MapsManager maps={maps} />
        ) : (
          <CardContent>
            <p className="text-sm text-muted">Banco de dados não configurado.</p>
          </CardContent>
        )}
      </Card>
      <Card>
        <CardHeader
          title={title(Trophy, "Configuração de níveis")}
          description="Configure os níveis de ELO e suas faixas de pontuação. Os jogadores são classificados automaticamente com base no ELO acumulado nos resultados dos mixes."
        />
        <LevelsEditor levels={levels} canEdit={canManageAdmins} />
      </Card>
      <Card>
        <CardHeader
          title={title(Plug, "API do CSRep")}
          description="Diagnóstico da integração: busca a especificação da API e testa endpoints usando a chave salva na Vercel."
        />
        <CsrepApiPanel configured={csrepApiConfigured()} />
      </Card>
    </div>
  );
}

async function PenaltiesSection() {
  const [users, penalties, history] = await Promise.all([listManagedUsers(), activePenalties(), penaltyHistory()]);
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
      history={history.map((p) => ({
        id: p.id,
        userName: names.get(p.userId) ?? "Jogador",
        delaySeconds: p.delaySeconds,
        reason: p.reason,
        expiresAt: p.expiresAt,
        createdAt: p.createdAt,
        isActive: p.isActive,
        appliedBy: (p.appliedBy && names.get(p.appliedBy)) || "—",
      }))}
    />
  );
}

const brDate = (date: string) => date.split("-").reverse().join("/");

/** "Mix atual" (padrão do painel): evento, deletar e finalizar com os prints. */
const resolveCurrentMix = cache(async (viewerId: string) => {
  const [next, pending] = await Promise.all([getNextMix(viewerId), listPendingFinalization()]);
  const current = next.status === "ok" ? next.mix : null;
  const started = !!current && getDataSource().now().getTime() >= current.occurrence.eventAt.getTime();
  const pendingOther = pending.find(
    (p) => !(current && p.scheduleId === current.schedule.id && p.date === current.occurrence.date),
  );
  const target =
    started && current && !current.finalizedMatchId
      ? { scheduleId: current.schedule.id, date: current.occurrence.date }
      : pendingOther
        ? { scheduleId: pendingOther.scheduleId, date: pendingOther.date }
        : null;
  return { current, target, pending };
});

async function CurrentMix({ viewerId }: { viewerId: string }) {
  const { current, target } = await resolveCurrentMix(viewerId);

  return (
    <Card className="border-win/40">
      <CardHeader
        title="Mix atual"
        description={
          current
            ? `Evento: ${brDate(current.occurrence.date)} às ${current.schedule.eventTime} · ${current.registrations.length} inscritos`
            : "Nenhum mix agendado no momento. Crie um mix abaixo."
        }
      />
      <CardContent className="space-y-5">
        {current && !current.finalizedMatchId && (
          <DeleteMixButton
            scheduleId={current.schedule.id}
            date={current.occurrence.date}
            label={`${brDate(current.occurrence.date)} às ${current.schedule.eventTime}`}
          />
        )}
        {current?.finalizedMatchId && (
          <Button variant="outline" className="w-full" asChild>
            <Link href={`/mixes/${current.finalizedMatchId}`}>
              <Flag /> Mix finalizado — ver resultado
            </Link>
          </Button>
        )}
        <div className="border-t border-border pt-4">
          <h3 className="mb-1 font-semibold">Finalizar mix e salvar estatísticas</h3>
          {target ? (
            <>
              {(!current || target.date !== current.occurrence.date) && (
                <p className="mb-3 text-sm text-muted">Mix de {brDate(target.date)} aguardando finalização.</p>
              )}
              <FinalizeSection scheduleId={target.scheduleId} date={target.date} />
            </>
          ) : (
            <p className="text-sm text-muted">
              {current && !current.finalizedMatchId
                ? `A finalização libera quando o mix começar (${brDate(current.occurrence.date)} às ${current.schedule.eventTime}).`
                : "Nenhum mix aguardando finalização."}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/** Outros mixes sem resultado (o que está em "Mix atual" não se repete aqui). */
async function PendingFinalization({ viewerId }: { viewerId: string }) {
  const { pending: all, target } = await resolveCurrentMix(viewerId);
  const pending = all.filter((p) => !(target && p.scheduleId === target.scheduleId && p.date === target.date));
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
