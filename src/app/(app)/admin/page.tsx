import { MixTimeline } from "@/components/admin/mix-timeline";
import { PushTestButton } from "@/components/admin/push-test-button";
import {
  Award,
  Bell,
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
  Swords,
  Trophy,
  Network,
  UsersRound,
} from "lucide-react";
import { RecalcPtsButton } from "@/components/admin/recalc-pts";
import { PunishmentRules } from "@/components/admin/punishment-rules";
import { StrikesPanel } from "@/components/admin/strikes-panel";
import { activeSuspensions, profileNames, recentStrikes } from "@/services/strikes";
import type { Metadata } from "next";
import { cache } from "react";
import { BulkUsersDialog } from "@/components/admin/bulk-users-form";
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
import { LeagueInvite, LeagueMembers } from "@/components/leagues/league-admin";
import { communityOverview, getCurrentLeague, leagueMembersView, manageableLeagues } from "@/services/league";
import { CommunityLeagues, CommunityPlayers } from "@/components/leagues/community-admin";
import { LeagueNamesForm } from "@/components/settings/league-names-form";
import { isPlatformAdmin } from "@/lib/auth/permissions";
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
import { nextOccurrence } from "@/lib/mix-schedule";
import { MapIcon as MapEmblem } from "@/components/maps/map-icon";
import { VapidKeyGenerator } from "@/components/admin/push-admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { pushConfigured } from "@/services/push";

export const metadata: Metadata = { title: "Painel administrativo" };
// A leitura dos prints por IA (finalização no painel) pode levar alguns segundos por imagem.
export const maxDuration = 60;

const TABS = {
  mix: { label: "Controle de mix", icon: Swords },
  liga: { label: "Ligas", icon: Trophy },
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
  // Links antigos continuam funcionando: Punições está em Configurações, Comunidade em Ligas.
  const aba = rawTab === "punicoes" ? "configuracoes" : rawTab === "comunidade" ? "liga" : rawTab;
  // Admin da liga (não da plataforma): só o controle de mix e a liga dele.
  const visibleTabs = (Object.keys(TABS) as Tab[]).filter(
    (t) => isPlatformAdmin(session) || t === "mix" || t === "liga",
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
        <div className="space-y-4">
          <CurrentMix viewerId={session!.id} />
          <GcExample />
          <div className="grid gap-4 lg:grid-cols-[1fr_24rem]">
            <CreateMixForm
              leagues={await manageableLeagues()}
              existing={(schedules ?? []).map((sc) => ({
                recurrence: sc.recurrence,
                eventTime: sc.eventTime,
              }))}
            />
            <div className="space-y-4 self-start">
              <Card>
                <CardHeader title="Mixes ativos" />
                {schedules ? (
                  <ScheduleList
                    schedules={schedules}
                    nextDates={Object.fromEntries(
                      schedules.map((sc) => [sc.id, nextOccurrence(sc.recurrence, getDataSource().now())]),
                    )}
                  />
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
              <PendingFinalization viewerId={session!.id} />
              <Card>
                <CardHeader title="Importar da GC" description="Mapas enviados pelo botão “Enviar ao MeuMix” na GC." />
                <CardContent className="pt-3">
                  <Button variant="outline" size="sm" className="w-full" asChild>
                    <Link href="/admin/importar-gc">Abrir mapas recebidos →</Link>
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      )}
      {/* Ligas: o super admin vê todas (convites, nomes, jogadores × ligas); o admin da liga, só a dele. */}
      {tab === "liga" &&
        (session?.isSuperAdmin ? <CommunityTab viewerId={session.id} /> : <LeagueTab viewerId={session!.id} />)}
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
          <StrikesSection />
          <UsersPanel canManageAdmins={canManageAdmins} currentUserId={session!.id} />
        </div>
      )}
      {tab === "configuracoes" && (
        <SettingsTab
          canManageAdmins={canManageAdmins}
          secao={typeof params.secao === "string" ? params.secao : undefined}
        />
      )}
    </>
  );
}

/**
 * Ligas (super admin): todas as ligas do sistema, com o convite de cada uma, e todos os
 * jogadores cadastrados × ligas (incluir, remover, admin e titular). Cobre a aba da liga.
 */
async function CommunityTab({ viewerId }: { viewerId: string }) {
  const view = await communityOverview();
  if (!view) {
    return (
      <Card>
        <EmptyState icon={Network} title="Rode as migrações das ligas (0045 a 0049) no Supabase" className="py-10" />
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Ligas"
          description="Cada liga é um mix com seus jogadores, ranking e ELO. Em cada card: o convite (link e código) e quem não é titular. Só ligas sem mixes podem ser excluídas."
        />
        <CardContent className="space-y-4">
          <CommunityLeagues leagues={view.leagues} />
          <div className="border-t border-border pt-4">
            <div className="mb-2 text-xs font-semibold tracking-wider text-muted uppercase">Nomes</div>
            <LeagueNamesForm leagues={view.leagues} />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader
          title="Jogadores × ligas"
          description="Membros de cada liga: inclua ou remova jogadores, escolha os admins e os titulares. Só os membros veem os mixes, o ranking e as estatísticas da liga."
        />
        <CardContent>
          <CommunityPlayers leagues={view.leagues} players={view.players} viewerId={viewerId} />
        </CardContent>
      </Card>
    </div>
  );
}

/** Liga atual: convite por link e membros (admins da plataforma e da liga). */
async function LeagueTab({ viewerId }: { viewerId: string }) {
  const league = await getCurrentLeague();
  if (!league || league.none) {
    return (
      <Card>
        <EmptyState icon={Trophy} title="Escolha uma liga no topo da página" className="py-10" />
      </Card>
    );
  }
  const view = await leagueMembersView(league.id);
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
      <Card className="self-start">
        <CardHeader title={`Convite: ${league.name}`} description="Link e código para entrar na liga." />
        <CardContent>
          <LeagueInvite leagueName={league.name} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader
          title="Membros"
          description="Só os membros veem os mixes, o ranking e as estatísticas da liga. Admin da liga cria, finaliza e exclui os mixes dela."
        />
        <CardContent>
          {view ? (
            <LeagueMembers leagueName={league.name} members={view.members} others={view.others} viewerId={viewerId} />
          ) : (
            <p className="text-sm text-muted">Rode a migração 0049_league_access.sql no Supabase.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** Faltas (60 dias) e suspensões das ligas que a pessoa administra. */
async function StrikesSection() {
  const leagues = await manageableLeagues();
  const ids = leagues.map((l) => l.id);
  const [strikes, suspensions] = await Promise.all([recentStrikes(ids), activeSuspensions()]);
  const mine = suspensions.filter((s) => ids.includes(s.leagueId));
  const names = await profileNames([...new Set([...strikes, ...mine].map((s) => s.userId))]);
  const league = (id: string) => leagues.find((l) => l.id === id)?.name ?? "Liga";
  return (
    <StrikesPanel
      suspensions={mine.map((s) => ({
        id: s.id,
        userName: names.get(s.userId) ?? "Jogador",
        league: league(s.leagueId),
        left: s.mixes - s.served,
        since: s.createdAt,
      }))}
      strikes={strikes.map((s) => ({
        id: s.id,
        userName: names.get(s.userId) ?? "Jogador",
        league: league(s.leagueId),
        date: s.date,
        kind: s.kind,
        points: s.points,
        expiresAt: s.expiresAt,
        pardoned: s.pardoned,
        suspended: s.suspended,
      }))}
    />
  );
}

async function UsersPanel({ canManageAdmins, currentUserId }: { canManageAdmins: boolean; currentUserId: string }) {
  const ds = getDataSource();
  const [result, league, mixes, elos] = await Promise.all([
    listManagedUsers(),
    getCurrentLeague(),
    ds.listMixes({ status: "finished" }).catch(() => []),
    ds.getElos().catch(() => new Map<string, number>()),
  ]);
  // Último mix de cada jogador na liga do topo (mais recente primeiro).
  const lastMix: Record<string, string> = {};
  for (const m of [...mixes].sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt)))
    for (const t of m.teams) for (const id of t.playerIds) lastMix[id] ??= m.scheduledAt;
  const leagueName = league && !league.none ? league.name : null;
  return (
    <Card>
      <CardHeader
        title="Jogadores cadastrados"
        description="Edite dados e Steam; no ⋯, ajuste o ELO, redefina a senha, gere o link pessoal ou exclua a conta. Só o super admin concede ou remove o papel de administrador."
        action={
          <div className="flex flex-wrap justify-end gap-2">
            {canManageAdmins && <BulkUsersDialog />}
            <BulkConfirmLinks />
          </div>
        }
      />
      {result.status === "ok" ? (
        result.users.length ? (
          <UsersTable
            users={result.users}
            canManageAdmins={canManageAdmins}
            currentUserId={currentUserId}
            leagueName={leagueName}
            lastMix={lastMix}
            inLeague={leagueName ? [...elos.keys()] : null}
            now={ds.now().getTime()}
          />
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
  const [badges, all, players] = await Promise.all([
    listBadges(),
    playerBadges(undefined, { history: true }),
    getDataSource().listPlayers(),
  ]);
  // Ativas + as desativadas à mão (para poder reativar).
  const granted = all.filter((g) => !g.deactivatedAt || g.locked);
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

const SETTINGS_SECTIONS = {
  mix: "Mix",
  punicoes: "Punições",
  mapas: "Mapas",
  niveis: "Níveis",
  integracoes: "Integrações",
} as const;
type SettingsSection = keyof typeof SETTINGS_SECTIONS;

/** Onde a configuração vale (todas as configurações daqui são da plataforma, não de uma liga). */
function Scope({ children = "Todas as ligas" }: { children?: React.ReactNode }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-muted normal-case">
      Vale para: {children}
    </span>
  );
}

async function SettingsTab({ canManageAdmins, secao }: { canManageAdmins: boolean; secao?: string }) {
  // Punições: só o super admin (as outras seções aparecem para os admins da plataforma).
  const sections = (Object.keys(SETTINGS_SECTIONS) as SettingsSection[]).filter(
    (k) => k !== "punicoes" || canManageAdmins,
  );
  const section: SettingsSection = sections.includes(secao as SettingsSection) ? (secao as SettingsSection) : "mix";
  const [features, musicUrl, maps, levels, elos] = await Promise.all([
    getFeatures(),
    section === "mix" ? getAppSetting("music_url") : Promise.resolve(null),
    section === "mapas" ? listAllMaps() : Promise.resolve([]),
    section === "niveis" ? getLevels() : Promise.resolve([]),
    section === "niveis" ? getDataSource().getElos() : Promise.resolve(new Map<string, number>()),
  ]);
  const title = (Icon: typeof Settings, text: string, className?: string) => (
    <span className="flex flex-wrap items-center gap-2">
      <Icon className={className ?? "size-4 text-muted"} aria-hidden /> {text}
    </span>
  );
  return (
    <div className="space-y-4">
      <FilterTabs
        label="Seção das configurações"
        current={section}
        options={sections.map((value) => ({
          value,
          label: SETTINGS_SECTIONS[value],
          href: value === "mix" ? "/admin?aba=configuracoes" : `/admin?aba=configuracoes&secao=${value}`,
        }))}
      />

      {section === "mix" && (
        <>
          <Card>
            <CardHeader
              title={title(UsersRound, "Funcionalidades do mix")}
              description="Ative ou desative funcionalidades do mix."
              action={<Scope />}
            />
            <FeatureToggles values={features} />
          </Card>
          <Card>
            <CardHeader
              title={title(Music, "Música de fundo")}
              description="Toca automaticamente uma música ao abrir o site. Alguns navegadores exigem um clique inicial antes de liberar o áudio."
              action={<Scope />}
            />
            <MusicSettings enabled={features.background_music} url={musicUrl} />
          </Card>
          {canManageAdmins && (
            <Card>
              <CardHeader
                title={title(UsersRound, "PTS, MVP e ELO")}
                description="Como a pontuação do mix (PTS) é calculada. Depois da migração 0060, use o botão para preencher as mortes trocadas dos mixes antigos da GC e refazer o MVP e o ELO."
                action={<Scope />}
              />
              <CardContent className="space-y-3">
                <div className="rounded-md border border-border bg-surface-2/50 px-3 py-2 font-mono text-xs leading-relaxed">
                  <span className="text-brand">PTS</span> = 3 × K + 1,5 × A + 2 × FK + 0,2 × ADR
                  <br />
                  <span className="invisible">PTS</span> − 0,5 × morte trocada − 1,5 × morte não trocada
                  <div className="mt-1 font-sans text-[11px] text-subtle">
                    Sem dados de trade da GC: −1,5 por morte.
                  </div>
                </div>
                <RecalcPtsButton />
              </CardContent>
            </Card>
          )}
        </>
      )}

      {section === "punicoes" && canManageAdmins && (
        <>
          <p className="text-sm text-muted">
            Regras automáticas de falta e suspensão, e o atraso de inscrição aplicado à mão.{" "}
            <Scope>todas as ligas (as faltas contam por liga)</Scope>
          </p>
          <PunishmentRulesSection features={features} />
          <PenaltiesSection />
        </>
      )}

      {section === "mapas" && (
        <Card>
          <CardHeader
            title={title(MapIcon, "Gerenciamento de mapas")}
            description="Configure os mapas disponíveis para votação nos mixes. Arraste para reordenar."
            action={<Scope />}
          />
          {maps.length ? (
            <MapsManager maps={maps} />
          ) : (
            <CardContent>
              <p className="text-sm text-muted">Banco de dados não configurado.</p>
            </CardContent>
          )}
        </Card>
      )}

      {section === "niveis" && (
        <Card>
          <CardHeader
            title={title(Trophy, "Configuração de níveis")}
            description="Faixas de ELO de cada nível. O mínimo de cada nível é o máximo do anterior + 1. A contagem de jogadores é da liga escolhida no topo."
            action={<Scope />}
          />
          <LevelsEditor levels={levels} canEdit={canManageAdmins} elos={[...elos.values()]} />
        </Card>
      )}

      {section === "integracoes" && (
        <>
          {canManageAdmins && (
            <Card>
              <CardHeader
                title={title(Bell, "Avisos no celular")}
                description="Notificações do MeuMix (lista abrindo, PICK, bolão, resultado e lives). Cada jogador ativa em Configurações."
                action={<Scope />}
              />
              <PushAdminStatus />
            </Card>
          )}
          {/* Ferramenta de desenvolvedor: só o super admin, recolhida. */}
          {canManageAdmins && (
            <Card>
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 font-display text-sm font-semibold tracking-wide uppercase">
                      <Plug className="size-4 text-muted" aria-hidden /> API do CSRep
                      <span className="text-[10px] font-normal tracking-normal text-subtle normal-case">avançado</span>
                    </span>
                    <span className="mt-0.5 block text-xs text-muted">
                      Diagnóstico da integração: busca a especificação da API e testa endpoints com a chave salva na
                      Vercel.
                    </span>
                  </span>
                  <span className="text-muted transition-transform group-open:rotate-90">▸</span>
                </summary>
                <div className="border-t border-border">
                  <CsrepApiPanel configured={csrepApiConfigured()} />
                </div>
              </details>
            </Card>
          )}
          {!canManageAdmins && (
            <Card>
              <p className="px-4 py-6 text-center text-sm text-muted">
                As integrações são configuradas pelo super admin.
              </p>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

async function PushAdminStatus() {
  if (!pushConfigured()) {
    return (
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted">
          Falta configurar: gere as chaves abaixo e crie <code>VAPID_PUBLIC_KEY</code> e <code>VAPID_PRIVATE_KEY</code>{" "}
          na Vercel (Settings → Environment Variables, ambiente Production). Depois, rode a migração{" "}
          <code>0031_bolao_push.sql</code> no Supabase.
        </p>
        <VapidKeyGenerator />
      </CardContent>
    );
  }
  const admin = createSupabaseAdminClient();
  const [{ count: devices, error }, { data: users }] = admin
    ? await Promise.all([
        admin.from("push_subscriptions").select("endpoint", { count: "exact", head: true }),
        admin.from("push_subscriptions").select("user_id"),
      ])
    : [{ count: null, error: true }, { data: null }];
  return (
    <CardContent className="space-y-2 text-sm">
      {error ? (
        <p className="text-loss">Chaves configuradas, mas falta rodar a migração 0031_bolao_push.sql no Supabase.</p>
      ) : (
        <p>
          <span className="font-semibold text-win">Ativo.</span>{" "}
          <span className="text-muted">
            {new Set((users ?? []).map((u) => u.user_id)).size} jogador(es) em {devices ?? 0} aparelho(s).
          </span>
        </p>
      )}
      <p className="text-xs text-subtle">
        Avisos por horário (inscrições abrindo, vagas, bolão fechando e lives) dependem do agendador chamando{" "}
        <code>/api/cron/avisos</code> a cada 5 minutos.
      </p>
      {!error && <PushTestButton />}
    </CardContent>
  );
}

async function PunishmentRulesSection({ features }: { features: Awaited<ReturnType<typeof getFeatures>> }) {
  const leagues = await manageableLeagues();
  const [strikes, suspensions] = await Promise.all([recentStrikes(leagues.map((l) => l.id)), activeSuspensions()]);
  return (
    <PunishmentRules
      values={{ strike_late_leave: features.strike_late_leave, strike_no_show: features.strike_no_show }}
      counts={{
        strikes: strikes.filter((s) => !s.pardoned && !s.suspended).length,
        suspensions: suspensions.length,
      }}
    />
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
          <MixTimeline
            opensAt={current.occurrence.opensAt}
            eventAt={current.occurrence.eventAt}
            now={getDataSource().now()}
            classified={current.registrations.filter((r) => r.status === "classified").length}
            max={current.schedule.maxPlayers}
            reserves={current.registrations.filter((r) => r.status === "reserve").length}
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
        {/* Zona de risco: discreta, no fim do card. */}
        {current && !current.finalizedMatchId && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
            <p className="text-xs text-muted">O mix não vai acontecer? Descarte só esta data; a agenda continua.</p>
            <DeleteMixButton
              scheduleId={current.schedule.id}
              date={current.occurrence.date}
              label={`${brDate(current.occurrence.date)} às ${current.schedule.eventTime}`}
              text="Descartar este mix"
              subtle
            />
          </div>
        )}
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
        description="Datas com inscritos e sem resultado. Lance o placar, ou descarte se o mix não aconteceu."
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
              <div className="flex shrink-0 items-center gap-1">
                <DeleteMixButton scheduleId={p.scheduleId} date={p.date} label={`${d}/${m}/${y}`} compact />
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/admin/finalizar?agenda=${p.scheduleId}&data=${p.date}`}>
                    <Flag /> Finalizar
                  </Link>
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
