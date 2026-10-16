import { Database, Plug, UserRound, Users } from "lucide-react";
import type { Metadata } from "next";
import { NotImplementedButton } from "@/components/not-implemented";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { INTEGRATIONS } from "@/lib/integrations";
import { getDataSource } from "@/services";

export const metadata: Metadata = { title: "Configurações" };

export default async function SettingsPage() {
  const ds = getDataSource();
  const [community, playerId] = await Promise.all([ds.getCommunity(), ds.getCurrentPlayerId()]);
  const player = playerId ? await ds.getPlayer(playerId) : null;

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
            description="A edição será liberada junto com a autenticação."
          />
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="nickname">Nickname</Label>
              <Input id="nickname" defaultValue={player?.nickname} disabled />
            </div>
            <div>
              <Label htmlFor="steam">Steam ID</Label>
              <Input
                id="steam"
                defaultValue={player?.steamId ?? ""}
                placeholder="Vinculado via integração Steam"
                disabled
              />
            </div>
            <NotImplementedButton feature="Edição de perfil">Salvar alterações</NotImplementedButton>
          </CardContent>
        </Card>

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
                <Badge variant="neutral" className="shrink-0">
                  Não implementada
                </Badge>
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
              Os dados exibidos são gerados localmente para demonstração. A conexão com o banco PostgreSQL (Supabase)
              será configurada por variáveis de ambiente — veja o <code className="text-fg">README.md</code>.
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
