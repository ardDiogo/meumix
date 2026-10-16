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

/* ------------------------------------------------------------------------ *
 * Datas no fuso da comunidade. O Brasil não tem horário de verão desde 2019,
 * então Brasília é sempre UTC−3.
 * ------------------------------------------------------------------------ */
export const COMMUNITY_UTC_OFFSET = "-03:00";
const OFFSET_MS = -3 * 3_600_000;
/** Por quanto tempo depois do início um mix continua sendo o "atual". */
export const EVENT_GRACE_MS = 4 * 3_600_000;

/** Data de hoje (AAAA-MM-DD) no fuso da comunidade. */
export function communityToday(now: Date) {
  return new Date(now.getTime() + OFFSET_MS).toISOString().slice(0, 10);
}

/** Converte data + hora locais da comunidade em um instante. */
export function communityInstant(date: string, hhmm: string) {
  return new Date(`${date}T${hhmm.slice(0, 5)}:00${COMMUNITY_UTC_OFFSET}`);
}

function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Próxima data (AAAA-MM-DD) do evento a partir de hoje (inclusive), no fuso da comunidade. */
export function nextOccurrence(r: MixRecurrence, from: Date): string {
  if (r.kind === "once") return r.date;
  const today = communityToday(from);
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  return addDays(today, (r.weekday - weekday + 7) % 7);
}

export interface Occurrence {
  date: string;
  eventAt: Date;
  opensAt: Date;
}

/**
 * Ocorrência "atual" de uma agenda: a próxima ainda não encerrada (um mix
 * continua atual por `EVENT_GRACE_MS` após o início). `null` se não houver.
 */
export function currentOccurrence(
  schedule: { recurrence: MixRecurrence; eventTime: string; registrationOpensAt: string },
  now: Date,
  /** Datas a pular (ex.: mix deletado pelo admin). */
  skip: (date: string) => boolean = () => false,
): Occurrence | null {
  const build = (date: string): Occurrence => ({
    date,
    eventAt: communityInstant(date, schedule.eventTime),
    opensAt: communityInstant(date, schedule.registrationOpensAt),
  });
  const ended = (o: Occurrence) => now.getTime() > o.eventAt.getTime() + EVENT_GRACE_MS;

  if (schedule.recurrence.kind === "once") {
    const o = build(schedule.recurrence.date);
    return ended(o) || skip(o.date) ? null : o;
  }
  // Começa pela ocorrência de ontem para cobrir mixes que viram a meia-noite.
  let date = nextOccurrence(schedule.recurrence, new Date(now.getTime() - 86_400_000));
  for (let i = 0; i < 4; i++) {
    const o = build(date);
    if (!ended(o) && !skip(date)) return o;
    date = addDays(date, 7);
  }
  return null;
}

export type RegistrationWindow = "not_open" | "open" | "closed";

/** Inscrições: abrem em `opensAt` e fecham no início do evento. */
export function registrationWindow(o: Occurrence, now: Date): RegistrationWindow {
  if (now < o.opensAt) return "not_open";
  if (now < o.eventAt) return "open";
  return "closed";
}
