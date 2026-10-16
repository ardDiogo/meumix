import type { MixRecurrence, Weekday } from "@/types/domain";

export const WEEKDAYS: { value: Weekday; label: string; short: string }[] = [
  { value: 1, label: "Segunda-feira", short: "seg" },
  { value: 2, label: "Terça-feira", short: "ter" },
  { value: 3, label: "Quarta-feira", short: "qua" },
  { value: 4, label: "Quinta-feira", short: "qui" },
  { value: 5, label: "Sexta-feira", short: "sex" },
  { value: 6, label: "Sábado", short: "sáb" },
  { value: 0, label: "Domingo", short: "dom" },
];

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h! * 60 + m!;
};

export function describeRecurrence(r: MixRecurrence) {
  if (r.kind === "weekly") {
    const day = WEEKDAYS.find((d) => d.value === r.weekday)!.label;
    return r.weekday === 0 || r.weekday === 6 ? `Todo ${day.toLowerCase()}` : `Toda ${day.toLowerCase()}`;
  }
  const [y, m, d] = r.date.split("-");
  return `Data única: ${d}/${m}/${y}`;
}

export interface ScheduleInput {
  recurrence: string; // "weekly:1" … "weekly:0" | "once"
  date: string;
  eventTime: string;
  registrationOpensAt: string;
}

export type ScheduleErrors = Partial<Record<keyof ScheduleInput, string>>;

/** Valida os dados do formulário. Regra compartilhada entre cliente e servidor. */
export function parseSchedule(
  input: ScheduleInput,
  today: string,
): { recurrence: MixRecurrence; errors: ScheduleErrors } {
  const errors: ScheduleErrors = {};
  let recurrence: MixRecurrence = { kind: "weekly", weekday: 1 };

  const weekly = /^weekly:([0-6])$/.exec(input.recurrence);
  if (weekly) recurrence = { kind: "weekly", weekday: Number(weekly[1]) as Weekday };
  else if (input.recurrence === "once") {
    if (!DATE.test(input.date)) errors.date = "Informe a data do mix.";
    else if (input.date < today) errors.date = "A data não pode estar no passado.";
    recurrence = { kind: "once", date: input.date };
  } else errors.recurrence = "Selecione o tipo de recorrência.";

  if (!TIME.test(input.eventTime)) errors.eventTime = "Informe a hora do evento.";
  if (!TIME.test(input.registrationOpensAt)) errors.registrationOpensAt = "Informe a hora de liberação.";
  if (
    !errors.eventTime &&
    !errors.registrationOpensAt &&
    toMinutes(input.registrationOpensAt) >= toMinutes(input.eventTime)
  ) {
    errors.registrationOpensAt = "As inscrições devem abrir antes do horário do evento.";
  }
  return { recurrence, errors };
}

/** Próxima data (AAAA-MM-DD) do evento a partir de `from` (inclusive). */
export function nextOccurrence(r: MixRecurrence, from: Date): string {
  if (r.kind === "once") return r.date;
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const diff = (r.weekday - d.getUTCDay() + 7) % 7;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}
