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

/**
 * Métricas lidas do print do CSRep (null = não aparece ou ilegível). `label` é o
 * nome no CSRep (vai para a IA); `pt`, o nome no site. `ref`: a referência
 * aproximada de "bom" — as mesmas que a IA usa na análise (actions.ts).
 * `kind` "csrep": medida da plataforma; "stat": K/D, ADR, rating e KAST de todas
 * as partidas (diferentes do resumo do MeuMix, que conta só os mixes).
 */
export const CSREP_METRICS = [
  {
    key: "trust_score",
    label: "Trust score",
    pt: "Confiança",
    unit: "%",
    digits: 0,
    better: "high",
    ref: null,
    kind: "csrep",
  },
  {
    key: "time_to_damage",
    label: "Time to damage",
    pt: "Tempo até o dano",
    unit: "ms",
    digits: 0,
    better: "low",
    ref: 500,
    kind: "csrep",
  },
  {
    key: "reaction_time",
    label: "Reaction time",
    pt: "Tempo de reação",
    unit: "ms",
    digits: 0,
    better: "low",
    ref: 320,
    kind: "csrep",
  },
  {
    key: "crosshair_placement",
    label: "Crosshair placement",
    pt: "Posição da mira",
    unit: "°",
    digits: 1,
    better: "low",
    ref: 6,
    kind: "csrep",
  },
  { key: "preaim", label: "Preaim", pt: "Pré-mira", unit: "°", digits: 1, better: "low", ref: 8, kind: "csrep" },
  { key: "kd_ratio", label: "K/D ratio", pt: "K/D", unit: "", digits: 2, better: "high", ref: 1, kind: "stat" },
  { key: "adr", label: "ADR", pt: "ADR", unit: "", digits: 1, better: "high", ref: null, kind: "stat" },
  {
    key: "aim_accuracy",
    label: "Aim accuracy",
    pt: "Precisão",
    unit: "%",
    digits: 1,
    better: "high",
    ref: 25,
    kind: "csrep",
  },
  {
    key: "head_accuracy",
    label: "Head accuracy",
    pt: "Precisão na cabeça",
    unit: "%",
    digits: 1,
    better: "high",
    ref: 18,
    kind: "csrep",
  },
  {
    key: "wallbang_kill_pct",
    label: "Wallbang kill",
    pt: "Kills atravessando parede",
    unit: "%",
    digits: 1,
    better: "high",
    ref: null,
    kind: "csrep",
  },
  {
    key: "smoke_kill_pct",
    label: "Smoke kill",
    pt: "Kills pela smoke",
    unit: "%",
    digits: 1,
    better: "high",
    ref: null,
    kind: "csrep",
  },
  {
    key: "hltv_rating",
    label: "HLTV rating 2.0",
    pt: "Rating HLTV 2.0",
    unit: "",
    digits: 2,
    better: "high",
    ref: 1,
    kind: "stat",
  },
  { key: "kast", label: "KAST", pt: "KAST", unit: "%", digits: 1, better: "high", ref: 70, kind: "stat" },
] as const;

/** "good" dentro da referência, "near" até 15% longe, "bad" além; sem referência: null. */
export function csrepTone(m: (typeof CSREP_METRICS)[number], v: number): "good" | "near" | "bad" | null {
  if (m.ref == null) return null;
  const ok = m.better === "low" ? v <= m.ref : v >= m.ref;
  if (ok) return "good";
  const off = Math.abs(v - m.ref) / m.ref;
  return off <= 0.15 ? "near" : "bad";
}

/** "Last 90 matches" → "últimas 90 partidas". */
export const csrepPeriodPt = (p: string | null | undefined) => {
  if (!p) return "período do print";
  const n = p.match(/(\d+)\s*match/i)?.[1];
  return n ? `últimas ${n} partidas` : p;
};

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
