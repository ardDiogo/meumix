import { Bell, Database, Link2, Plug, UserRound, Users } from "lucide-react";
import type { Metadata } from "next";
import { NotImplementedButton } from "@/components/not-implemented";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { INTEGRATIONS } from "@/lib/integrations";
import { ConfirmLinkBox } from "@/components/players/confirm-link-box";
import { SteamLinkForm } from "@/components/players/steam-link-form";
import { TwitchLinkForm } from "@/components/players/twitch-link-form";
import { TwitchIcon } from "@/components/twitch/twitch-icon";
import { myConfirmLink } from "./actions";
import { getDataSource } from "@/services";
import { getSession } from "@/services/auth";
import { profileAvatars } from "@/services/avatars";
import { profileTwitch } from "@/services/twitch";
import { PushSettings } from "@/components/push/push-settings";
import { pushConfigured, vapidPublicKey } from "@/services/push";

export const metadata: Metadata = { title: "Configurações" };

export default async function SettingsPage() {
  const ds = getDataSource();
  const [community, playerId] = await Promise.all([ds.getCommunity(), ds.getCurrentPlayerId()]);
  const [player, session] = await Promise.all([playerId ? ds.getPlayer(playerId) : null, getSession()]);
  const [steam, twitch] = session
    ? await Promise.all([
        profileAvatars([session.id]).then((m) => m.get(session.id)),
        profileTwitch([session.id]).then((m) => m.get(session.id) ?? null),
      ])
    : [undefined, null];

  return (
    <>
      <PageHeader title="Configurações" description="Conta, comunidade e integrações externas." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <UserRound className="size-4 text-muted" /> Perfil
              </span>
            }
            description={
              session ? "Vincule sua Steam para usar a foto do perfil no site." : "Entre na sua conta para editar."
            }
          />
          <CardContent className="space-y-4">
            {session ? (
              <SteamLinkForm
                name={session.displayName}
                avatarUrl={steam?.avatarUrl ?? null}
                steamUrl={steam?.steamUrl ?? null}
              />
            ) : (
              <div>
                <Label htmlFor="nickname">Nickname</Label>
                <Input id="nickname" defaultValue={player?.nickname} disabled />
              </div>
            )}
          </CardContent>
        </Card>

        {session && (
          <Card id="avisos" className="scroll-mt-20">
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <Bell className="size-4 text-muted" /> Avisos no celular
                </span>
              }
              description="Cada aparelho ativa e escolhe os seus avisos."
            />
            <CardContent>
              <PushSettings publicKey={pushConfigured() ? vapidPublicKey() : null} />
            </CardContent>
          </Card>
        )}

        {session && (
          <Card>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <TwitchIcon className="size-4 text-muted" /> Twitch
                </span>
              }
              description="Se você transmite os mixes, cadastre seu canal: a live aparece no site e a gravação fica na página do mix."
            />
            <CardContent>
              <TwitchLinkForm login={twitch} />
            </CardContent>
          </Card>
        )}

        {session && (
          <Card>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <Link2 className="size-4 text-muted" /> Confirmação rápida (sem login)
                </span>
              }
              description="Abra este link uma vez no celular: depois, o link do grupo do WhatsApp confirma sua presença com 1 toque, mesmo sem login."
            />
            <CardContent>
              <ConfirmLinkBox load={myConfirmLink} />
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <Users className="size-4 text-muted" /> Comunidade
              </span>
            }
            description="Cada comunidade terá seus próprios mixes, membros e rankings."
          />
          <CardContent className="space-y-3 text-sm">
            <Row label="Comunidade ativa" value={community.name} />
            <Row label="ELO inicial" value={String(community.startingElo)} />
            <NotImplementedButton feature="Gestão de comunidades">Gerenciar comunidades</NotImplementedButton>
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <Plug className="size-4 text-muted" /> Integrações
              </span>
            }
          />
          <ul className="divide-y divide-border">
            {INTEGRATIONS.map((i) => (
              <li key={i.provider} className="flex items-start justify-between gap-4 px-4 py-3">
                <div>
                  <div className="font-medium">{i.name}</div>
                  <div className="text-sm text-muted">{i.description}</div>
                </div>
                {i.status === "available" ? (
                  <Badge variant="win" className="shrink-0">
                    Ativa
                  </Badge>
                ) : (
                  <Badge variant="neutral" className="shrink-0">
                    Não implementada
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <Database className="size-4 text-muted" /> Fonte de dados
              </span>
            }
          />
          <CardContent className="space-y-3 text-sm">
            <Row label="Origem" value={ds.kind === "demo" ? "Demonstração (dados fictícios)" : "Supabase"} />
            <p className="text-muted">
              {ds.kind === "demo"
                ? "Os dados exibidos são gerados localmente para demonstração. Configure o Supabase nas variáveis de ambiente — veja o README.md."
                : "Os dados vêm do banco PostgreSQL (Supabase) da comunidade."}
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border pb-2">
      <span className="text-muted">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
