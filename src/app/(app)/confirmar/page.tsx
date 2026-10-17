import { CalendarClock, CheckCircle2, Link2Off, LogIn } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { JoinButton } from "@/components/registrations/join-button";
import { LiveRefresh } from "@/components/registrations/live-refresh";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { getPermissions } from "@/services/auth";
import { confirmLinkUser } from "@/services/confirm-links";
import { getNextMix } from "@/services/mix-events";

export const metadata: Metadata = { title: "Confirmar presença" };

const TZ = "America/Sao_Paulo";
const when = (d: Date) => {
  const w = d.toLocaleDateString("pt-BR", { weekday: "long", timeZone: TZ });
  const day = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: TZ });
  const hour = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
  return `${w.charAt(0).toUpperCase()}${w.slice(1)}, ${day} às ${hour}`;
};

/**
 * Link de 1 toque compartilhado no WhatsApp: com as inscrições abertas,
 * inscreve quem abre a página (mesmas regras do Dashboard). Reconhece o
 * jogador pelo login ou pelo link pessoal lembrado neste navegador.
 */
export default async function ConfirmarPage({ searchParams }: PageProps<"/confirmar">) {
  const { link } = await searchParams;
  const { session } = await getPermissions();
  const linked = session ? null : await confirmLinkUser();
  const viewer = session ? { id: session.id, displayName: session.displayName } : linked;

  if (!viewer) {
    const invalid = link === "invalido";
    return (
      <Card className="mx-auto max-w-lg">
        <EmptyState
          icon={invalid ? Link2Off : LogIn}
          title={invalid ? "Link pessoal inválido ou substituído" : "Quem é você?"}
          description={
            invalid
              ? "Esse link foi trocado por um novo. Peça o link atualizado a um administrador ou entre na sua conta."
              : "Entre na sua conta ou abra uma vez o seu link pessoal (peça a um administrador) para confirmar sem login."
          }
          action={
            <Button variant="primary" asChild>
              <Link href="/entrar?next=/confirmar">
                <LogIn /> Entrar
              </Link>
            </Button>
          }
        />
      </Card>
    );
  }

  const result = await getNextMix(viewer.id).catch(() => null);
  if (!result || result.status !== "ok") {
    return (
      <Card className="mx-auto max-w-lg">
        <EmptyState
          icon={CalendarClock}
          title={result ? "Nenhum mix agendado" : "Não foi possível carregar o mix"}
          description={
            result ? "Quando o próximo mix for criado, o link volta a funcionar." : "Tente de novo em instantes."
          }
          action={
            <Button variant="secondary" asChild>
              <Link href="/dashboard">Ir para o Dashboard</Link>
            </Button>
          }
        />
      </Card>
    );
  }

  const { schedule, occurrence, registrations } = result.mix;
  const mine = registrations.find((r) => r.userId === viewer.id);
  const classified = registrations.filter((r) => r.status === "classified").length;

  return (
    <div className="mx-auto max-w-lg">
      <LiveRefresh scheduleId={schedule.id} />
      <Card>
        <div className="space-y-4 p-5 text-center">
          <div>
            <p className="text-xs font-semibold tracking-wider text-brand uppercase">Mix MeuMix</p>
            <h1 className="mt-1 font-display text-2xl font-bold tracking-tight">{when(occurrence.eventAt)}</h1>
            <p className="mt-1 text-sm text-muted">
              Inscrições abrem {when(occurrence.opensAt).toLowerCase()} ·{" "}
              <span className="text-fg tabular">
                {classified}/{schedule.maxPlayers}
              </span>{" "}
              classificados
            </p>
          </div>
          {mine && (
            <div className="flex items-center justify-center gap-2 rounded-md border border-win/30 bg-win/10 px-3 py-2 text-sm font-medium text-win">
              <CheckCircle2 className="size-4" aria-hidden />
              Presença confirmada: #{mine.position} — {mine.status === "classified" ? "classificado" : "suplente"}
            </div>
          )}
          <JoinButton
            scheduleId={schedule.id}
            date={occurrence.date}
            loggedIn
            registered={!!mine}
            opensAt={occurrence.opensAt.getTime()}
            eventAt={occurrence.eventAt.getTime()}
            penaltyDelay={result.mix.myPenaltyDelay}
            autoJoin
            loginNext="/confirmar"
          />
          {linked ? (
            <p className="text-xs text-subtle">
              Confirmando como <span className="font-medium text-fg">{linked.displayName}</span> pelo link pessoal ·{" "}
              <a href="/confirmar/sair" className="underline hover:text-brand">
                Não é você?
              </a>
            </p>
          ) : (
            <Link href="/dashboard" className="inline-block text-sm text-muted hover:text-brand">
              Ver lista completa e votações no Dashboard →
            </Link>
          )}
        </div>
      </Card>
    </div>
  );
}
