/**
 * Níveis 1–10 por ELO (docs/especificacao-tecnica.md, 4.9). Os valores reais
 * vêm de `level_configs` (editáveis no admin); estes são o padrão/fallback.
 */
export const ELO_CAP = 1600;

export interface LevelDef {
  level: number;
  min: number;
  max: number;
  color: string;
}

export const LEVELS: readonly LevelDef[] = [
  { level: 1, min: 0, max: 99, color: "#7C3AED" },
  { level: 2, min: 100, max: 219, color: "#2563EB" },
  { level: 3, min: 220, max: 349, color: "#0284C7" },
  { level: 4, min: 350, max: 499, color: "#0891B2" },
  { level: 5, min: 500, max: 659, color: "#059669" },
  { level: 6, min: 660, max: 829, color: "#16A34A" },
  { level: 7, min: 830, max: 1009, color: "#65A30D" },
  { level: 8, min: 1010, max: 1209, color: "#CA8A04" },
  { level: 9, min: 1210, max: 1459, color: "#EA580C" },
  { level: 10, min: 1460, max: ELO_CAP, color: "#FF0000" },
];

export function levelForElo(elo: number, levels: readonly LevelDef[] = LEVELS): LevelDef {
  let found = levels[0] ?? LEVELS[0]!;
  for (const l of levels) if (Math.max(elo, 0) >= l.min) found = l;
  return found;
}

/** Valida a tabela de níveis editada no admin. Devolve a mensagem de erro ou null. */
export function validateLevels(levels: LevelDef[]): string | null {
  if (levels.length !== 10) return "Informe os 10 níveis.";
  let prevMax = -1;
  for (const [i, l] of levels.entries()) {
    if (l.level !== i + 1) return "Os níveis devem ir de 1 a 10.";
    if (!Number.isInteger(l.min) || !Number.isInteger(l.max)) return `Nível ${l.level}: use números inteiros.`;
    if (l.min !== prevMax + 1) {
      return i === 0
        ? "O nível 1 deve começar em 0."
        : `Nível ${l.level}: o mínimo deve ser ${prevMax + 1} (máximo do nível ${l.level - 1} + 1).`;
    }
    if (l.max < l.min) return `Nível ${l.level}: o máximo deve ser maior ou igual ao mínimo.`;
    if (!/^#[0-9a-f]{6}$/i.test(l.color)) return `Nível ${l.level}: cor inválida (use #RRGGBB).`;
    prevMax = l.max;
  }
  if (prevMax > ELO_CAP) return `O nível 10 vai no máximo até ${ELO_CAP} (teto do ELO).`;
  return null;
}

/** ELO inicial a partir do nível da Gamers Club (0–20). Espelha `initial_elo_from_gc`. */
export function initialEloFromGc(gc: number) {
  const g = Math.min(Math.max(Math.round(gc), 0), 20);
  const elo = g <= 7 ? Math.round((g / 7) * 100) : Math.round(100 + ((g - 8) / 12) * (1210 - 100));
  return Math.min(elo, Math.floor(1460 * 1.1), ELO_CAP);
}
