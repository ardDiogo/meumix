/** Níveis 1–10 por ELO (docs/especificacao-tecnica.md, 4.9). Espelha `level_configs`. */
export const ELO_CAP = 1600;

export const LEVELS = [
  { level: 1, min: 0, max: 99, color: "#a1a1aa" },
  { level: 2, min: 100, max: 219, color: "#22c55e" },
  { level: 3, min: 220, max: 349, color: "#22c55e" },
  { level: 4, min: 350, max: 499, color: "#eab308" },
  { level: 5, min: 500, max: 659, color: "#eab308" },
  { level: 6, min: 660, max: 829, color: "#eab308" },
  { level: 7, min: 830, max: 1009, color: "#f97316" },
  { level: 8, min: 1010, max: 1209, color: "#f97316" },
  { level: 9, min: 1210, max: 1459, color: "#ef4444" },
  { level: 10, min: 1460, max: ELO_CAP, color: "#ef4444" },
] as const;

export function levelForElo(elo: number) {
  let found: (typeof LEVELS)[number] = LEVELS[0];
  for (const l of LEVELS) if (Math.max(elo, 0) >= l.min) found = l;
  return found;
}

/** ELO inicial a partir do nível da Gamers Club (0–20). Espelha `initial_elo_from_gc`. */
export function initialEloFromGc(gc: number) {
  const g = Math.min(Math.max(Math.round(gc), 0), 20);
  const elo = g <= 7 ? Math.round((g / 7) * 100) : Math.round(100 + ((g - 8) / 12) * (1210 - 100));
  return Math.min(elo, Math.floor(1460 * 1.1), ELO_CAP);
}
