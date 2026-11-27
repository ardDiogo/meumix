import { ELO_CAP } from "./levels";
import { rpPerformance, rpResult } from "./rp";

/**
 * Simulação de mudanças na PTS (só leitura: não grava nada). Compara a fórmula
 * atual com versões em que a morte não trocada pesa mais e o Swing da GC entra
 * na PTS, e refaz o ELO do histórico com cada versão (aproximação: parte do ELO
 * de antes de cada jogador no primeiro mix e soma o RP mix a mix).
 */
export interface SimVariant {
  key: string;
  label: string;
  /** Peso da morte não trocada. */
  untraded: number;
  /** Peso de cada morte quando o mix não tem os dados de trade. */
  noTradeData: number;
  /** Peso do Swing: pontos por round que o jogador "ganhou" para o time. */
  swing: number;
}

export const SIM_VARIANTS: SimVariant[] = [
  { key: "atual", label: "Atual", untraded: 1.5, noTradeData: 1.5, swing: 0 },
  { key: "s2", label: "−2,5 + Swing ×2", untraded: 2.5, noTradeData: 2, swing: 2 },
  { key: "s5", label: "−2,5 + Swing ×5", untraded: 2.5, noTradeData: 2, swing: 5 },
  { key: "s6", label: "−2,5 + Swing ×6", untraded: 2.5, noTradeData: 2, swing: 6 },
];

export interface SimPlayer {
  key: string;
  userId: string | null;
  name: string;
  team: "A" | "B";
  k: number;
  a: number;
  d: number;
  fk: number;
  adr: number | null;
  tradedDeaths: number | null;
  /** Swing médio por round (0,021 = +2,1%) e rounds jogados (dados da GC). */
  swing: number | null;
  rounds: number | null;
  /** ELO antes do mix (o gravado). */
  eloBefore: number | null;
  /** 1 vitória, 0,5 empate, 0 derrota. */
  score: 1 | 0.5 | 0;
}

export interface SimMix {
  id: string;
  name: string;
  date: string;
  players: SimPlayer[];
}

export function simPts(p: SimPlayer, v: SimVariant) {
  const traded = p.tradedDeaths == null ? 0 : Math.min(Math.max(p.tradedDeaths, 0), p.d);
  const deaths = p.tradedDeaths == null ? p.d * v.noTradeData : traded * 0.5 + (p.d - traded) * v.untraded;
  const swing = p.swing != null && p.rounds ? v.swing * p.swing * p.rounds : 0;
  return 3 * p.k + 1.5 * p.a + 2 * p.fk + 0.2 * (p.adr ?? 0) - deaths + swing;
}

/** Ordem pela PTS (empate: mais kills, depois mais assistências). O 1º é o MVP. */
export function rankByPts(players: SimPlayer[], v: SimVariant) {
  return players.map((p) => ({ p, pts: simPts(p, v) })).sort((x, y) => y.pts - x.pts || y.p.k - x.p.k || y.p.a - x.p.a);
}

/** ELO final de cada jogador com a variante (mixes em ordem de data). */
export function simElo(mixes: SimMix[], v: SimVariant) {
  const elo = new Map<string, number>();
  const ordered = [...mixes].sort((a, b) => a.date.localeCompare(b.date));
  for (const mix of ordered) {
    const now = (p: SimPlayer) => (p.userId ? (elo.get(p.userId) ?? p.eloBefore) : p.eloBefore);
    const avg = (t: "A" | "B") => {
      const xs = mix.players
        .filter((p) => p.team === t)
        .map(now)
        .filter((x): x is number => x != null);
      return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
    };
    const eloA = avg("A") ?? avg("B") ?? 0;
    const eloB = avg("B") ?? eloA;
    const pts = mix.players.map((p) => simPts(p, v));
    const stats = mix.players.some((p) => p.k > 0 || p.d > 0);
    const ptsAvg = stats ? pts.reduce((a, b) => a + b, 0) / pts.length : null;
    mix.players.forEach((p, i) => {
      if (!p.userId) return;
      const before = now(p) ?? 0;
      const result = rpResult(p.score, p.team === "A" ? eloA : eloB, p.team === "A" ? eloB : eloA);
      const perf = rpPerformance(pts[i]!, ptsAvg);
      const rp = Math.round(Math.round(result * 100) / 100 + Math.round(perf * 100) / 100);
      elo.set(p.userId, Math.min(Math.max(before + rp, 0), ELO_CAP));
    });
  }
  return elo;
}
