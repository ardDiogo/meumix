/* Regras: docs/regras-do-mix.md, seção "Faltas e suspensão". */

/** Sair faltando menos disso (sendo classificado) conta 1 falta. */
export const LATE_LEAVE_MS = 3 * 60 * 60 * 1000;
/** Faltas ativas (em 60 dias, na mesma liga) que geram a suspensão. */
export const STRIKES_TO_SUSPEND = 2;
/** Mixes da liga em que o suspenso só entra como reserva. */
export const SUSPENSION_MIXES = 2;

export type StrikeKind = "late_leave" | "no_show";

/** Saída é tardia: classificado saindo a menos de 3h do mix (e antes de começar). */
export const isLateLeave = (classified: boolean, eventAt: number, now: number) =>
  classified && now < eventAt && eventAt - now <= LATE_LEAVE_MS;

/**
 * Ordem da lista do mix: por horário de inscrição, com os suspensos (só reserva) depois
 * de todos os outros. Recebe as linhas já em ordem de created_at.
 */
export const queueOrder = <T extends { reserve_only?: boolean | null }>(rows: T[]): T[] =>
  [...rows].sort((a, b) => Number(!!a.reserve_only) - Number(!!b.reserve_only));
