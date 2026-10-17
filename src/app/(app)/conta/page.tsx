import { Download, KeyRound, Mail, ShieldAlert, UserRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChangePasswordForm, DeleteAccountForm } from "@/components/account/account-forms";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { LEGAL } from "@/lib/legal";
import { getSession } from "@/services/auth";

export const metadata: Metadata = { title: "Minha conta" };

export default async function AccountPage() {
  const session = await getSession();
  if (!session) redirect("/entrar?next=/conta");
  const role = session.isSuperAdmin ? "Super admin" : session.role === "admin" ? "Administrador" : "Jogador";

  return (
    <>
      <PageHeader title="Minha conta" description="Senha, cópia dos seus dados e exclusão da conta." />
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <UserRound className="size-4 text-muted" /> Conta
              </span>
            }
          />
          <CardContent className="space-y-0 text-sm">
            <Row label="E-mail" value={session.email} />
            <Row label="Nick" value={session.displayName} />
            <div className="flex items-center justify-between gap-4 border-b border-border py-2.5">
              <span className="text-muted">Papel</span>
              <Badge variant={role === "Jogador" ? "neutral" : "brand"}>{role}</Badge>
            </div>
            <p className="pt-3 text-xs text-subtle">
              Foto, Steam, Twitch e link pessoal ficam em{" "}
              <Link href="/configuracoes" className="text-brand hover:underline">
                Configurações
              </Link>
              .
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <KeyRound className="size-4 text-muted" /> Alterar senha
              </span>
            }
          />
          <CardContent>
            <ChangePasswordForm />
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <Download className="size-4 text-muted" /> Meus dados
              </span>
            }
          />
          <CardContent className="space-y-4 text-sm">
            <p className="text-muted">
              Baixe uma cópia de tudo o que o MeuMix guarda sobre você — conta, perfil, inscrições, votos, estatísticas,
              histórico de ELO, insígnias, clipes e registro das suas ações — num arquivo JSON (direito de acesso e
              portabilidade, LGPD art. 18).
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
          <CardHeader
            title={
              <span className="flex items-center gap-2 text-loss">
                <ShieldAlert className="size-4" /> Excluir conta
              </span>
            }
          />
          <CardContent className="space-y-4 text-sm">
            <p className="text-muted">
              Apaga <strong className="text-fg">permanentemente</strong> sua conta, perfil, inscrições, votos, clipes,
              insígnias, penalidades e histórico de ELO. <strong className="text-fg">Não dá para desfazer.</strong> Nos
              placares dos mixes já jogados, seu nick vira “Jogador removido”, para não alterar os resultados dos outros
              jogadores.
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
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-2.5">
      <span className="text-muted">{label}</span>
      <span className="truncate font-medium">{value}</span>
    </div>
  );
}
