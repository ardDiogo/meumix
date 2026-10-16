const dateFmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", timeZone: "America/Sao_Paulo" });
const dateTimeFmt = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});
const intFmt = new Intl.NumberFormat("pt-BR");

export const formatDate = (iso: string) => dateFmt.format(new Date(iso)).replace(".", "");
export const formatDateTime = (iso: string) => dateTimeFmt.format(new Date(iso)).replace(".", "");
export const formatInt = (n: number) => intFmt.format(n);

export function formatDecimal(n: number | null | undefined, digits = 2) {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function formatPercent(n: number | null | undefined, digits = 0) {
  if (n == null || Number.isNaN(n)) return "—";
  return `${n.toLocaleString("pt-BR", { maximumFractionDigits: digits })}%`;
}

export function formatSigned(n: number) {
  if (n === 0) return "0";
  return n > 0 ? `+${intFmt.format(n)}` : `−${intFmt.format(Math.abs(n))}`;
}

export function formatOrdinal(n: number | null) {
  return n == null ? "—" : `#${n}`;
}
