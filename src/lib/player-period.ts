import type { Mix } from "@/types/domain";

/** Períodos do resumo do jogador: geral, últimos 30/90 dias e cada ano em que ele jogou. */
export interface PeriodOption {
  value: string;
  label: string;
}

const DAY = 86_400_000;

export function playerPeriods(mixes: Mix[]): PeriodOption[] {
  const years = [...new Set(mixes.map((m) => m.scheduledAt.slice(0, 4)))].sort().reverse();
  return [
    { value: "geral", label: "Geral" },
    { value: "30d", label: "Últimos 30 dias" },
    { value: "90d", label: "Últimos 90 dias" },
    ...years.map((y) => ({ value: y, label: y })),
  ];
}

/** Período válido para estes mixes (o que não existir vira "geral"). */
export function parsePlayerPeriod(value: unknown, mixes: Mix[]): PeriodOption {
  const options = playerPeriods(mixes);
  return options.find((o) => o.value === value) ?? options[0]!;
}

export function mixesInPeriod(mixes: Mix[], period: string, now: Date): Mix[] {
  if (period === "30d" || period === "90d") {
    const since = now.getTime() - (period === "30d" ? 30 : 90) * DAY;
    return mixes.filter((m) => new Date(m.scheduledAt).getTime() >= since);
  }
  if (/^\d{4}$/.test(period)) return mixes.filter((m) => m.scheduledAt.startsWith(period));
  return mixes;
}
