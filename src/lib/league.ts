/** Ligas: tipos e nomes, sem dependência do servidor. */

export interface League {
  id: string;
  slug: string;
  name: string;
  /** Dia do mix (0 = domingo). */
  weekday: number | null;
}

/** Cookie com o slug da liga escolhida no seletor. */
export const LEAGUE_COOKIE = "meumix_liga";

/** A liga principal nasceu como "MeuMix": no site ela é o Mix da Lanterna (segunda). */
export function leagueLabel(slug: string, name: string) {
  return slug === "principal" && (!name || name === "MeuMix") ? "Mix da Lanterna" : name;
}

export const validLeagueSlug = (s: unknown): s is string => typeof s === "string" && /^[a-z0-9-]{1,40}$/.test(s);
