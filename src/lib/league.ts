/** Ligas: tipos e nomes, sem dependência do servidor. */

export interface League {
  id: string;
  slug: string;
  name: string;
  /** Dia do mix (0 = domingo). */
  weekday: number | null;
  /** Quem não participa de nenhuma liga (as consultas voltam vazias). */
  none?: boolean;
}

/** Cookie com o slug da liga escolhida no seletor. */
export const LEAGUE_COOKIE = "meumix_liga";

/** A liga principal nasceu como "MeuMix": no site ela é o Mix da Lanterna (segunda). */
export function leagueLabel(slug: string, name: string) {
  return slug === "principal" && (!name || name === "MeuMix") ? "Mix da Lanterna" : name;
}

export const validLeagueSlug = (s: unknown): s is string => typeof s === "string" && /^[a-z0-9-]{1,40}$/.test(s);

const WEEKDAY_FULL = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];

/** Subtítulo da liga: "Mix de Segunda-feira". */
export const leagueDayLabel = (weekday: number | null | undefined) =>
  weekday == null ? null : `Mix de ${WEEKDAY_FULL[weekday] ?? ""}`;

/**
 * "Hoje" no fuso de Brasília, com o dia virando às 6h: o mix de segunda que passa
 * da meia-noite continua sendo segunda.
 */
export function leagueToday(now = new Date()) {
  const local = new Date(now.getTime() - (3 + 6) * 3_600_000);
  return { date: local.toISOString().slice(0, 10), weekday: local.getUTCDay() };
}

/** Valor do cookie: a liga escolhida e o dia da escolha ("terca|2026-11-10"). */
export const leagueCookieValue = (slug: string, now = new Date()) => `${slug}|${leagueToday(now).date}`;

/**
 * Qual liga abrir. Ordem: a escolhida no seletor hoje; a liga com mix hoje (pela agenda,
 * `withMixToday`, ex.: um jogo numa quinta; senão pelo dia de costume: segunda →
 * Lanterna); a última escolhida; a primeira em que a pessoa joga; a primeira visível.
 */
export function pickLeagueSlug(
  cookie: string | null | undefined,
  visible: { slug: string; weekday: number | null }[],
  memberSlugs: Set<string>,
  now = new Date(),
  withMixToday: Set<string> = new Set(),
): string | null {
  if (!visible.length) return null;
  const has = (s: string | undefined) => !!s && visible.some((l) => l.slug === s);
  const [chosen, day] = (cookie ?? "").split("|");
  const today = leagueToday(now);
  if (has(chosen) && day === today.date) return chosen!;
  const ofToday = [
    ...visible.filter((l) => withMixToday.has(l.slug)),
    ...visible.filter((l) => !withMixToday.has(l.slug) && l.weekday === today.weekday),
  ];
  const pick = ofToday.find((l) => memberSlugs.has(l.slug)) ?? ofToday[0];
  if (pick) return pick.slug;
  if (has(chosen)) return chosen!;
  return (visible.find((l) => memberSlugs.has(l.slug)) ?? visible[0]!).slug;
}
