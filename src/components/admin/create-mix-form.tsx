"use client";

import { AlertCircle, CalendarPlus, Info, Loader2, Trophy } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { createMixSchedule, type CreateMixState } from "@/app/(app)/admin/actions";
import { communityToday, describeRecurrence, nextOccurrence, parseSchedule, WEEKDAYS } from "@/lib/mix-schedule";
import { leagueDayLabel } from "@/lib/league";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader } from "../ui/card";
import { Input, Label, Select } from "../ui/input";

const todayISO = () => communityToday(new Date());

/**
 * Novo mix. A 1ª pergunta é de qual mix (liga) é o jogo: quem cuida de uma liga só vê
 * ela; quem cuida de mais de uma escolhe (jogos fora do dia de costume, ex.: quinta).
 */
export function CreateMixForm({ leagues = [] }: { leagues?: { id: string; name: string; weekday: number | null }[] }) {
  const [state, action, pending] = useActionState<CreateMixState, FormData>(createMixSchedule, { status: "idle" });
  const [leagueId, setLeagueId] = useState(leagues.length === 1 ? leagues[0]!.id : "");
  const [recurrence, setRecurrence] = useState("weekly:1");
  const [date, setDate] = useState("");
  const [eventTime, setEventTime] = useState("20:00");
  const [registrationOpensAt, setRegistrationOpensAt] = useState("12:00");

  useEffect(() => {
    if (state.status === "saved") toast.success(state.message);
    if (state.status === "error") toast.error(state.message);
  }, [state]);

  const errors = state.status === "invalid" ? state.errors : {};
  const parsed = parseSchedule({ recurrence, date, eventTime, registrationOpensAt }, todayISO());
  const valid = Object.keys(parsed.errors).length === 0;
  const next = valid ? nextOccurrence(parsed.recurrence, new Date()) : null;

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
              <Label htmlFor="leagueId">De qual mix é este jogo?</Label>
              <Select id="leagueId" name="leagueId" value={leagueId} onChange={(e) => setLeagueId(e.target.value)}>
                <option value="" disabled>
                  Escolha o mix…
                </option>
                {leagues.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                    {leagueDayLabel(l.weekday) ? ` (${leagueDayLabel(l.weekday)})` : ""}
                  </option>
                ))}
              </Select>
              <p className="mt-1 text-xs text-muted">
                O jogo entra no ranking, no ELO e no histórico desse mix, mesmo num dia diferente do de costume.
              </p>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className={recurrence === "once" ? "" : "sm:col-span-2"}>
              <Label htmlFor="recurrence">Tipo de recorrência</Label>
              <Select
                id="recurrence"
                name="recurrence"
                value={recurrence}
                onChange={(e) => setRecurrence(e.target.value)}
              >
                {WEEKDAYS.map((d) => (
                  <option key={d.value} value={`weekly:${d.value}`}>
                    {describeRecurrence({ kind: "weekly", weekday: d.value })}
                  </option>
                ))}
                <option value="once">Data única</option>
              </Select>
              <FieldError message={errors.recurrence} />
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

          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full"
            disabled={pending || (leagues.length > 1 && !leagueId)}
          >
            {pending ? <Loader2 className="animate-spin" /> : <CalendarPlus />}
            {pending ? "Criando…" : "Criar mix"}
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
