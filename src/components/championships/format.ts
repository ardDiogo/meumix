import { WEEKDAYS } from "@/lib/championship";

const day = (d: string) =>
  new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });

/** "10 de nov. de 2026 — 15 de dez. de 2026" (ou só o início). */
export function formatDateRange(start: string | null, end: string | null) {
  if (start && end) return `${day(start)} — ${day(end)}`;
  if (start) return `A partir de ${day(start)}`;
  if (end) return `Até ${day(end)}`;
  return null;
}

/** "Segunda e Terça". */
export function formatDays(days: number[]) {
  const names = days.map((d) => WEEKDAYS[d]!);
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} e ${names.at(-1)}` : (names[0] ?? "-");
}
