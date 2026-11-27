"use client";

import { AlertCircle, CalendarPlus, Info, Loader2, Trophy } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { createMixSchedule, type CreateMixState } from "@/app/(app)/admin/actions";
import { communityToday, describeRecurrence, nextOccurrence, parseSchedule, WEEKDAYS } from "@/lib/mix-schedule";
import { leagueDayLabel } from "@/lib/league";
import type { MixRecurrence } from "@/types/domain";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader } from "../ui/card";
import { Input, Label, Select } from "../ui/input";

const todayISO = () => communityToday(new Date());

/**
 * Novo mix. A 1ª pergunta é de qual mix (liga) é o jogo: quem cuida de uma liga só vê
 * ela; quem cuida de mais de uma escolhe (jogos fora do dia de costume, ex.: quinta).
 */
export function CreateMixForm({
  leagues = [],
  existing = [],
}: {
  leagues?: { id: string; name: string; weekday: number | null }[];
  /** Agendas ativas (para avisar quando o novo mix repete um dia que já existe). */
  existing?: { recurrence: MixRecurrence; eventTime: string }[];
}) {
  const [state, action, pending] = useActionState<CreateMixState, FormData>(createMixSchedule, { status: "idle" });
  const [leagueId, setLeagueId] = useState(leagues.length === 1 ? leagues[0]!.id : "");
  // Dia padrão: o dia de costume da liga (sem dia definido: segunda).
  const dayOf = (id: string) => leagues.find((l) => l.id === id)?.weekday ?? null;
  const initialDay = leagues.length === 1 ? dayOf(leagues[0]!.id) : null;
  const [recurrence, setRecurrence] = useState(`weekly:${initialDay ?? 1}`);
  const [touchedDay, setTouchedDay] = useState(false);
  const [date, setDate] = useState("");
  const [eventTime, setEventTime] = useState("20:00");
  const [registrationOpensAt, setRegistrationOpensAt] = useState("12:00");

  useEffect(() => {
    if (state.status === "saved") toast.success(state.message);
    if (state.status === "error") toast.error(state.message);
  }, [state]);

  const errors = state.status === "invalid" ? state.errors : {};
  // "Hoje" é uma data única já com a data de hoje (sem procurar no calendário).
  const today = todayISO();
  const isToday = recurrence === "today";
  const sentRecurrence = isToday ? "once" : recurrence;
  const sentDate = isToday ? today : date;
  const parsed = parseSchedule({ recurrence: sentRecurrence, date: sentDate, eventTime, registrationOpensAt }, today);
  const valid = Object.keys(parsed.errors).length === 0;
  const next = valid ? nextOccurrence(parsed.recurrence, new Date()) : null;
  // Já existe um mix ativo no mesmo dia (semanal) ou na mesma data (única)?
  const duplicate = valid
    ? existing.find((e) =>
        parsed.recurrence.kind === "weekly"
          ? e.recurrence.kind === "weekly" && e.recurrence.weekday === parsed.recurrence.weekday
          : e.recurrence.kind === "once" && e.recurrence.date === parsed.recurrence.date,
      )
    : undefined;
  const needsLeague = leagues.length > 1 && !leagueId;

  return (
    <Card>
      <CardHeader
        title="Criar novo mix"
        description="Configure um evento de mix e o horário de abertura das inscrições."
      />
      <CardContent>
        <form action={action} className="space-y-4" noValidate>
          {leagues.length === 1 && (
            <div className="flex items-center gap-2 rounded-md border border-border bg-surface-2/60 px-3 py-2 text-sm">
              <Trophy className="size-4 shrink-0 text-brand" aria-hidden />
              <span className="text-muted">Mix:</span> <span className="font-medium">{leagues[0]!.name}</span>
              <input type="hidden" name="leagueId" value={leagues[0]!.id} />
            </div>
          )}
          {leagues.length > 1 && (
            <div>
              <Label htmlFor="leagueId">Liga</Label>
              <Select
                id="leagueId"
                name="leagueId"
                value={leagueId}
                onChange={(e) => {
                  setLeagueId(e.target.value);
                  // Sem o admin ter mexido no dia, acompanha o dia de costume da liga escolhida.
                  const day = dayOf(e.target.value);
                  if (!touchedDay && day != null) setRecurrence(`weekly:${day}`);
                }}
              >
                <option value="" disabled>
                  Escolha a liga…
                </option>
                {leagues.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                    {leagueDayLabel(l.weekday) ? ` (${leagueDayLabel(l.weekday)})` : ""}
                  </option>
                ))}
              </Select>
              <p className="mt-1 text-xs text-muted">
                O jogo conta no ranking, no ELO e no histórico dessa liga, mesmo num dia diferente do de costume.
              </p>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className={recurrence === "once" ? "" : "sm:col-span-2"}>
              <Label htmlFor="recurrence">Tipo de recorrência</Label>
              <Select
                id="recurrence"
                value={recurrence}
                onChange={(e) => {
                  setRecurrence(e.target.value);
                  setTouchedDay(true);
                }}
              >
                <option value="today">Hoje ({today.split("-").reverse().slice(0, 2).join("/")})</option>
                {WEEKDAYS.map((d) => (
                  <option key={d.value} value={`weekly:${d.value}`}>
                    {describeRecurrence({ kind: "weekly", weekday: d.value })}
                  </option>
                ))}
                <option value="once">Data única</option>
              </Select>
              <input type="hidden" name="recurrence" value={sentRecurrence} />
              {isToday && <input type="hidden" name="date" value={today} />}
              <FieldError message={errors.recurrence ?? (isToday ? errors.date : undefined)} />
            </div>
            {recurrence === "once" && (
              <div>
                <Label htmlFor="date">Data</Label>
                <Input
                  id="date"
                  name="date"
                  type="date"
                  min={todayISO()}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  aria-invalid={!!errors.date}
                />
                <FieldError message={errors.date} />
              </div>
            )}
            <div>
              <Label htmlFor="eventTime">Hora do evento</Label>
              <Input
                id="eventTime"
                name="eventTime"
                type="time"
                value={eventTime}
                onChange={(e) => setEventTime(e.target.value)}
                aria-invalid={!!errors.eventTime}
              />
              <FieldError message={errors.eventTime} />
            </div>
            <div>
              <Label htmlFor="registrationOpensAt">Hora de liberação das inscrições</Label>
              <Input
                id="registrationOpensAt"
                name="registrationOpensAt"
                type="time"
                value={registrationOpensAt}
                onChange={(e) => setRegistrationOpensAt(e.target.value)}
                aria-invalid={!!errors.registrationOpensAt}
              />
              <FieldError message={errors.registrationOpensAt} />
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-md border border-border bg-surface-2/60 px-3 py-2.5 text-sm text-muted">
            <Info className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
            {valid && next ? (
              <p>
                <span className="text-fg">{describeRecurrence(parsed.recurrence)}</span> às{" "}
                <span className="text-fg tabular">{eventTime}</span>. Próxima data:{" "}
                <span className="text-fg tabular">{next.split("-").reverse().join("/")}</span>, com inscrições a partir
                das <span className="text-fg tabular">{registrationOpensAt}</span>.
              </p>
            ) : (
              <p>Preencha os campos para ver o resumo do evento.</p>
            )}
          </div>

          {duplicate && (
            <div
              role="status"
              className="flex items-start gap-2 rounded-md border border-yellow-500/40 bg-yellow-500/10 px-3 py-2.5 text-sm text-yellow-300"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p>
                Já existe um mix ativo <b>{describeRecurrence(duplicate.recurrence).toLowerCase()}</b> às{" "}
                <b className="tabular">{duplicate.eventTime}</b>. Criar este faz um segundo mix nesse dia.
              </p>
            </div>
          )}

          <Button type="submit" variant="primary" size="lg" className="w-full" disabled={pending || needsLeague}>
            {pending ? <Loader2 className="animate-spin" /> : <CalendarPlus />}
            {pending
              ? "Criando…"
              : needsLeague
                ? "Escolha a liga para criar"
                : duplicate
                  ? "Criar mesmo assim"
                  : "Criar mix"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-1.5 flex items-center gap-1 text-xs text-loss">
      <AlertCircle className="size-3.5" aria-hidden /> {message}
    </p>
  );
}
