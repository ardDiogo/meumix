import { isValidSteamId64 } from "./integrations/steam";

/** Perfil no CSRep: https://csrep.gg/player/<SteamID64>. */
export function csrepUrlFor(steamId: string | null | undefined) {
  return steamId && isValidSteamId64(steamId) ? `https://csrep.gg/player/${steamId}` : null;
}

/** Aceita o link do CSRep ou o SteamID64 e devolve o link normalizado. */
export function parseCsrepInput(raw: string): string | null {
  const text = raw.trim();
  if (isValidSteamId64(text)) return csrepUrlFor(text);
  const m = text.match(/^(?:https?:\/\/)?(?:www\.)?csrep\.gg\/player\/(\d{17})\/?(?:[?#].*)?$/i);
  return m && isValidSteamId64(m[1]!) ? csrepUrlFor(m[1]) : null;
}

/** Métricas lidas do print do CSRep (null = não aparece ou ilegível). */
export const CSREP_METRICS = [
  { key: "trust_score", label: "Trust score", unit: "%", digits: 0, better: "high" },
  { key: "time_to_damage", label: "Time to damage", unit: "ms", digits: 0, better: "low" },
  { key: "reaction_time", label: "Reaction time", unit: "ms", digits: 0, better: "low" },
  { key: "crosshair_placement", label: "Crosshair placement", unit: "°", digits: 1, better: "low" },
  { key: "preaim", label: "Preaim", unit: "°", digits: 1, better: "low" },
  { key: "kd_ratio", label: "K/D ratio", unit: "", digits: 2, better: "high" },
  { key: "adr", label: "ADR", unit: "", digits: 1, better: "high" },
  { key: "aim_accuracy", label: "Aim accuracy", unit: "%", digits: 1, better: "high" },
  { key: "head_accuracy", label: "Head accuracy", unit: "%", digits: 1, better: "high" },
  { key: "wallbang_kill_pct", label: "Wallbang kill", unit: "%", digits: 1, better: "high" },
  { key: "smoke_kill_pct", label: "Smoke kill", unit: "%", digits: 1, better: "high" },
  { key: "hltv_rating", label: "HLTV rating 2.0", unit: "", digits: 2, better: "high" },
  { key: "kast", label: "KAST", unit: "%", digits: 1, better: "high" },
] as const;

export type CsrepMetricKey = (typeof CSREP_METRICS)[number]["key"];
export type CsrepMetrics = Partial<Record<CsrepMetricKey, number | null>> & { period?: string | null };

export interface AnalysisItem {
  title: string;
  detail: string;
}

export interface PlayerAnalysis {
  summary: string;
  strengths: AnalysisItem[];
  weaknesses: AnalysisItem[];
  improvements: AnalysisItem[];
}

const num = (v: unknown) => {
  const n = typeof v === "string" ? Number(v.replace(",", ".").replace(/[^\d.-]/g, "")) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const items = (v: unknown, max: number): AnalysisItem[] =>
  (Array.isArray(v) ? v : [])
    .map((i) => ({ title: str(i?.title, 80), detail: str(i?.detail, 500) }))
    .filter((i) => i.title && i.detail)
    .slice(0, max);

/** Saneia a resposta da IA (métricas + análise). Lança erro se não servir. */
export function sanitizeCsrep(raw: unknown): { metrics: CsrepMetrics; analysis: PlayerAnalysis } {
  const r = (raw ?? {}) as { metrics?: Record<string, unknown>; analysis?: Record<string, unknown> };
  const metrics: CsrepMetrics = { period: str(r.metrics?.period, 40) || null };
  for (const m of CSREP_METRICS) metrics[m.key] = num(r.metrics?.[m.key]);
  const found = CSREP_METRICS.filter((m) => metrics[m.key] != null).length;
  if (found < 3) throw new Error("O print não parece ser a tela de estatísticas do CSRep");
  const analysis: PlayerAnalysis = {
    summary: str(r.analysis?.summary, 800),
    strengths: items(r.analysis?.strengths, 5),
    weaknesses: items(r.analysis?.weaknesses, 5),
    improvements: items(r.analysis?.improvements, 6),
  };
  if (!analysis.summary || !analysis.improvements.length) throw new Error("A IA não devolveu a análise completa");
  return { metrics, analysis };
}
