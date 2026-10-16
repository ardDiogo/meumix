import { CalendarClock, Users } from "lucide-react";
import { headers } from "next/headers";
import { registrationWindow } from "@/lib/mix-schedule";
import { cn } from "@/lib/utils";
import { getPermissions } from "@/services/auth";
import { getNextMix } from "@/services/mix-events";
import { Avatar } from "../ui/avatar";
import { Badge } from "../ui/badge";
import { Card, CardHeader } from "../ui/card";
import { EmptyState } from "../ui/empty-state";
import { Table, TD, TH, THead, TR } from "../ui/table";
import { JoinButton, RemoveButton, ResetButton } from "./registration-controls";
import { ShareMixButton } from "./share-mix";

const TZ = "America/Sao_Paulo";
const dayMonth = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: TZ });
const hourMin = (d: Date) => d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
const weekday = (d: Date) => {
  const w = d.toLocaleDateString("pt-BR", { weekday: "long", timeZone: TZ });
  return w.charAt(0).toUpperCase() + w.slice(1);
};
const fullTime = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: TZ,
  });

async function siteUrl() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : "https://meumix.vercel.app";
}

/** Texto do convite no formato do WhatsApp (*negrito*). */
function inviteMessage(opts: {
  eventAt: Date;
  opensAt: Date;
  classified: string[];
  reserves: string[];
  maxPlayers: number;
  link: string;
}) {
  const lines = [
    `🎮 *MIX MEUMIX - ${weekday(opts.eventAt)}, ${dayMonth(opts.eventAt)} às ${hourMin(opts.eventAt)}*`,
    `⏰ Inscrições abrem às ${hourMin(opts.opensAt)} (${dayMonth(opts.opensAt)})`,
    `👥 ${opts.classified.length}/${opts.maxPlayers} jogadores classificados`,
  ];
  if (opts.classified.length) {
    lines.push("", "📋 *Jogadores:*", ...opts.classified.map((n, i) => `${i + 1}. ${n}`));
  }
  if (opts.reserves.length) {
    lines.push("", "🪑 *Suplentes:*", ...opts.reserves.map((n, i) => `${i + 1}. ${n}`));
  }
  const left = opts.maxPlayers - opts.classified.length;
  lines.push(
    "",
    left > 0
      ? `🔥 Faltam ${left} vaga${left > 1 ? "s" : ""}! Inscreva-se:`
      : "✅ Vagas preenchidas! Entre como suplente:",
    opts.link,
  );
  return lines.join("\n");
}

/** Próximo mix com inscrições reais. Só usuários cadastrados podem participar. */
export async function NextMixPanel() {
  const [result, { session, canManageMixes }] = await Promise.all([getNextMix(), getPermissions()]);
  if (result.status === "not_configured") return null;

  if (result.status === "none") {
    return (
      <Card className="mb-4">
        <EmptyState
          icon={CalendarClock}
          title="Nenhum mix agendado"
          description={canManageMixes ? "Crie um mix no painel de administração." : "O próximo mix aparecerá aqui."}
          className="py-8"
        />
      </Card>
    );
  }

  const { schedule, occurrence, organizer, registrations } = result.mix;
  const now = new Date();
  const regWindow = registrationWindow(occurrence, now);
  const mine = session ? registrations.find((r) => r.userId === session.id) : undefined;
  const classified = registrations.filter((r) => r.status === "classified").length;
  const message = inviteMessage({
    eventAt: occurrence.eventAt,
    opensAt: occurrence.opensAt,
    classified: registrations.filter((r) => r.status === "classified").map((r) => r.displayName),
    reserves: registrations.filter((r) => r.status === "reserve").map((r) => r.displayName),
    maxPlayers: schedule.maxPlayers,
    link: `${await siteUrl()}/dashboard`,
  });
  const opensLabel =
    dayMonth(occurrence.opensAt) === dayMonth(now)
      ? `hoje às ${hourMin(occurrence.opensAt)}`
      : `${dayMonth(occurrence.opensAt)} às ${hourMin(occurrence.opensAt)}`;

  return (
    <section aria-label="Próximo mix" className="mb-4 space-y-4">
      <Card>
        <div className="flex flex-col gap-4 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-xl font-bold tracking-tight">Participar do mix</h2>
                {regWindow === "open" && <Badge variant="win">Inscrições abertas</Badge>}
                {regWindow === "not_open" && <Badge variant="neutral">Inscrições em breve</Badge>}
                {regWindow === "closed" && <Badge variant="brand">Mix em andamento</Badge>}
              </div>
              <p className="mt-1 text-sm text-muted">
                {organizer && (
                  <>
                    Organizado por <span className="text-fg">{organizer}</span> ·{" "}
                  </>
                )}
                Mix: <span className="text-fg">{weekday(occurrence.eventAt)}</span>,{" "}
                <span className="text-fg tabular">
                  {dayMonth(occurrence.eventAt)} às {hourMin(occurrence.eventAt)}
                </span>{" "}
                · Inscrições abrem:{" "}
                <span className="text-fg tabular">
                  {dayMonth(occurrence.opensAt)} às {hourMin(occurrence.opensAt)}
                </span>
              </p>
              {mine && (
                <p className="mt-2 text-sm">
                  Você está inscrito na posição <span className="font-semibold text-brand">#{mine.position}</span> —{" "}
                  {mine.status === "classified" ? "classificado" : "suplente"}.
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {canManageMixes && registrations.length > 0 && (
                <ResetButton scheduleId={schedule.id} date={occurrence.date} />
              )}
              <ShareMixButton message={message} />
            </div>
          </div>
          <JoinButton
            scheduleId={schedule.id}
            date={occurrence.date}
            loggedIn={!!session}
            registered={!!mine}
            regWindow={regWindow}
            opensLabel={opensLabel}
          />
        </div>
      </Card>

      <Card>
        <CardHeader
          title={`Jogadores inscritos (${classified}/${schedule.maxPlayers} classificados)`}
          description="Lista ordenada por horário de inscrição. Após as vagas, os inscritos entram como suplentes."
        />
        {registrations.length ? (
          <Table>
            <THead>
              <TR>
                <TH className="w-12 text-center">#</TH>
                <TH className="min-w-40">Nick</TH>
                <TH>Status</TH>
                <TH>Horário</TH>
                {canManageMixes && <TH className="text-right">Ações</TH>}
              </TR>
            </THead>
            <tbody>
              {registrations.map((r) => (
                <TR key={r.id} className={cn(r.userId === session?.id && "bg-brand/5")}>
                  <TD className="text-center font-display font-bold text-muted">{r.position}</TD>
                  <TD>
                    <div className="flex items-center gap-2">
                      <Avatar name={r.displayName} size="xs" />
                      <span className="font-medium">{r.displayName}</span>
                    </div>
                  </TD>
                  <TD>
                    {r.status === "classified" ? (
                      <Badge variant="win">Classificado</Badge>
                    ) : (
                      <Badge variant="neutral">Suplente</Badge>
                    )}
                  </TD>
                  <TD className="text-muted">{fullTime(r.createdAt)}</TD>
                  {canManageMixes && (
                    <TD className="text-right">
                      <RemoveButton registrationId={r.id} name={r.displayName} />
                    </TD>
                  )}
                </TR>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState
            icon={Users}
            title="Nenhum inscrito ainda"
            description="Seja o primeiro a garantir sua vaga."
            className="py-8"
          />
        )}
        <div className="border-t border-border px-4 py-3 text-center text-sm text-muted">
          Necessário <span className="font-semibold text-fg">{schedule.maxPlayers} jogadores classificados</span> para
          iniciar a seleção de equipes ({classified}/{schedule.maxPlayers}).
        </div>
      </Card>
    </section>
  );
}
