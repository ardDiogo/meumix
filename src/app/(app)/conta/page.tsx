import { Bell, Download, KeyRound, Link2, Mail, ShieldAlert, UserRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChangePasswordForm, DeleteAccountForm } from "@/components/account/account-forms";
import { PageHeader } from "@/components/page-header";
import { ConfirmLinkBox } from "@/components/players/confirm-link-box";
import { SteamLinkForm } from "@/components/players/steam-link-form";
import { TwitchLinkForm } from "@/components/players/twitch-link-form";
import { PushSettings } from "@/components/push/push-settings";
import { TwitchIcon } from "@/components/twitch/twitch-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { LEGAL } from "@/lib/legal";
import { getDataSource } from "@/services";
import { getSession } from "@/services/auth";
import { profileAvatars } from "@/services/avatars";
import { listLeagues, myLeagueIds } from "@/services/league";
import { pushConfigured, vapidPublicKey } from "@/services/push";
import { profileTwitch } from "@/services/twitch";
import { myConfirmLink } from "../configuracoes/actions";

export const metadata: Metadata = { title: "Minha conta" };

const TABS = {
  perfil: "Perfil",
  avisos: "Avisos",
  seguranca: "Segurança",
  privacidade: "Privacidade",
} as const;
type Tab = keyof typeof TABS;

const title = (Icon: React.ComponentType<{ className?: string }>, text: string, className = "text-muted") => (
  <span className="flex items-center gap-2">
    <Icon className={`size-4 ${className}`} /> {text}
  </span>
);

/**
 * Minha conta (juntou as antigas "Minha conta" e "Configurações"): perfil (Steam,
 * Twitch e ligas), avisos e confirmação rápida, senha, e privacidade (dados e exclusão).
 * O que é da plataforma (nomes das ligas, integrações) fica no Admin.
 */
export default async function AccountPage({ searchParams }: PageProps<"/conta">) {
  const session = await getSession();
  if (!session) redirect("/entrar?next=/conta");
  const { aba } = await searchParams;
  const tab: Tab = typeof aba === "string" && aba in TABS ? (aba as Tab) : "perfil";
  const role = session.isSuperAdmin ? "Super admin" : session.role === "admin" ? "Administrador" : "Jogador";

  return (
    <>
      <PageHeader title="Minha conta" description="Perfil, avisos, senha e os seus dados." />
      <FilterTabs
        className="mb-4"
        label="Seção da conta"
        current={tab}
        options={(Object.entries(TABS) as [Tab, string][]).map(([value, label]) => ({
          value,
          label,
          href: value === "perfil" ? "/conta" : `/conta?aba=${value}`,
        }))}
      />
      {tab === "perfil" && <ProfileTab session={session} role={role} />}
      {tab === "avisos" && (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <Card id="avisos" className="scroll-mt-20">
            <CardHeader
              title={title(Bell, "Avisos no celular")}
              description="Cada aparelho ativa e escolhe os seus avisos."
            />
            <CardContent>
              <PushSettings publicKey={pushConfigured() ? vapidPublicKey() : null} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader
              title={title(Link2, "Confirmação rápida (sem login)")}
              description="Abra este link uma vez no celular: depois, o link do grupo do WhatsApp confirma sua presença com 1 toque, mesmo sem login."
            />
            <CardContent>
              <ConfirmLinkBox load={myConfirmLink} />
            </CardContent>
          </Card>
        </div>
      )}
      {tab === "seguranca" && (
        <Card className="max-w-xl">
          <CardHeader title={title(KeyRound, "Alterar senha")} />
          <CardContent>
            <ChangePasswordForm />
          </CardContent>
        </Card>
      )}
      {tab === "privacidade" && (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title={title(Download, "Meus dados")} />
            <CardContent className="space-y-4 text-sm">
              <p className="text-muted">
                Baixe uma cópia de tudo o que o MeuMix guarda sobre você — conta, perfil, inscrições, votos,
                estatísticas, histórico de ELO, insígnias, clipes e registro das suas ações — num arquivo JSON (direito
                de acesso e portabilidade, LGPD art. 18).
              </p>
              <Button variant="outline" className="w-full" asChild>
                <a href="/conta/dados" download>
                  <Download /> Baixar meus dados
                </a>
              </Button>
              <p className="flex items-start gap-2 text-xs text-subtle">
                <Mail className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  Correção, dúvidas ou outros pedidos sobre seus dados:{" "}
                  <a href={`mailto:${LEGAL.contactEmail}`} className="text-brand hover:underline">
                    {LEGAL.contactEmail}
                  </a>{" "}
                  (resposta em até 15 dias). Veja a{" "}
                  <Link href="/privacidade" className="text-brand hover:underline">
                    Política de Privacidade
                  </Link>
                  .
                </span>
              </p>
            </CardContent>
          </Card>
          <Card className="border-loss/40">
            <CardHeader title={title(ShieldAlert, "Excluir conta", "text-loss")} />
            <CardContent className="space-y-4 text-sm">
              <p className="text-muted">
                Apaga <strong className="text-fg">permanentemente</strong> sua conta, perfil, inscrições, votos, clipes,
                insígnias, penalidades e histórico de ELO. <strong className="text-fg">Não dá para desfazer.</strong>{" "}
                Nos placares dos mixes já jogados, seu nick vira “Jogador removido”, para não alterar os resultados dos
                outros jogadores.
              </p>
              <DeleteAccountForm
                disabledReason={
                  session.isSuperAdmin
                    ? "O super administrador não pode se excluir por aqui: primeiro remova o seu e-mail de SUPER_ADMIN_EMAILS na Vercel."
                    : undefined
                }
              />
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}

async function ProfileTab({
  session,
  role,
}: {
  session: NonNullable<Awaited<ReturnType<typeof getSession>>>;
  role: string;
}) {
  const ds = getDataSource();
  const [steam, twitch, leagues, mine] = await Promise.all([
    profileAvatars([session.id]).then((m) => m.get(session.id)),
    profileTwitch([session.id]).then((m) => m.get(session.id) ?? null),
    ds.kind === "supabase" ? listLeagues() : Promise.resolve([]),
    myLeagueIds(),
  ]);
  const myLeagues = (leagues ?? []).filter((l) => mine.has(l.id));
  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title={title(UserRound, "Conta")} />
        <CardContent className="space-y-0 text-sm">
          <Row label="E-mail" value={session.email} />
          <Row label="Nick" value={session.displayName} />
          <div className="flex items-center justify-between gap-4 border-b border-border py-2.5">
            <span className="text-muted">Papel</span>
            <Badge variant={role === "Jogador" ? "neutral" : "brand"}>{role}</Badge>
          </div>
          {myLeagues.length > 0 && <Row label="Você joga em" value={myLeagues.map((l) => l.name).join(" · ")} />}
          <p className="pt-3 text-xs text-subtle">
            Cada liga tem seus próprios mixes, ELO, ranking e insígnias; troque de liga no topo da página. O ELO inicial
            vem do seu nível da GC, em cada liga.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader
          title={title(UserRound, "Steam")}
          description="Vincule sua Steam para usar a foto do perfil no site."
        />
        <CardContent>
          <SteamLinkForm
            name={session.displayName}
            avatarUrl={steam?.avatarUrl ?? null}
            steamUrl={steam?.steamUrl ?? null}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader
          title={title(TwitchIcon, "Twitch")}
          description="Se você transmite os mixes, cadastre seu canal: a live aparece no site e a gravação fica na página do mix."
        />
        <CardContent>
          <TwitchLinkForm login={twitch} />
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-2.5">
      <span className="text-muted">{label}</span>
      <span className="truncate text-right font-medium">{value}</span>
    </div>
  );
}
