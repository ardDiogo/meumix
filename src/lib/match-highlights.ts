import { pickMvpAndLanterna } from "./match-rules";

/** Linha da tabela de estatísticas do resultado (somatório da série). */
export interface StatRow {
  key: string;
  userId: string | null;
  name: string;
  team: "A" | "B";
  elo: number | null;
  /** Foto do perfil Steam, se vinculado. */
  avatarUrl: string | null;
  k: number;
  a: number;
  d: number;
  adr: number | null;
  kast: number | null;
  s: number | null;
  fa: number;
  mk: number;
  fk: number;
  rp: number;
  drop: number;
  isMvp: boolean;
  isLanterna: boolean;
}

export const diffOf = (r: StatRow) => r.k - r.d;
export const kdrOf = (r: StatRow) => (r.d ? r.k / r.d : r.k);

export type HighlightKey = "mvp" | "kills" | "adr" | "kdr" | "fk" | "assists" | "deaths" | "worst";

export interface Highlight {
  key: HighlightKey;
  row: StatRow;
}

const maxBy = (rows: StatRow[], value: (r: StatRow) => number) =>
  rows.reduce<StatRow | null>((best, r) => (best == null || value(r) > value(best) ? r : best), null);

/**
 * Destaques da partida. MVP e pior performance usam o que foi gravado na
 * finalização (mesma regra do ELO); sem essa marcação, recalcula.
 */
export function matchHighlights(rows: StatRow[]): Highlight[] {
  if (!rows.length) return [];
  const picked = pickMvpAndLanterna(rows.map((r) => ({ kills: r.k, deaths: r.d, assists: r.a, adr: r.adr })));
  const mvp = rows.find((r) => r.isMvp) ?? rows[picked.mvp];
  const worst = rows.find((r) => r.isLanterna) ?? (picked.lanterna >= 0 ? rows[picked.lanterna] : undefined);
  const list: (Highlight | null)[] = [
    mvp ? { key: "mvp", row: mvp } : null,
    { key: "kills", row: maxBy(rows, (r) => r.k)! },
    rows.some((r) => r.adr != null) ? { key: "adr", row: maxBy(rows, (r) => r.adr ?? -1)! } : null,
    { key: "kdr", row: maxBy(rows, kdrOf)! },
    { key: "fk", row: maxBy(rows, (r) => r.fk)! },
    { key: "assists", row: maxBy(rows, (r) => r.a)! },
    { key: "deaths", row: maxBy(rows, (r) => r.d)! },
    worst ? { key: "worst", row: worst } : null,
  ];
  return list.filter((h): h is Highlight => h != null);
}
