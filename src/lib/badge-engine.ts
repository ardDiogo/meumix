import { BOLAO_MAX, bolaoRanking, type PredictionScore } from "./bolao";
import { approxRating } from "./rating";

/**
 * Motor das insígnias automáticas. Função pura: recebe os resultados oficiais
 * (partidas finalizadas, em ordem) e devolve TODAS as conquistas que deveriam
 * existir — inclusive as já encerradas — e o progresso atual de cada jogador.
 * O banco é sincronizado com esse resultado (sync_auto_badges), então rodar de
 * novo com os mesmos dados não muda nada, e corrigir um resultado recalcula tudo.
 *
 * Regras:
 * - Só contam partidas finalizadas (só elas existem em mix_matches) e linhas de
 *   jogador com conta vinculada e ELO aplicado (calculate_elo).
 * - Sequências (Foguinho, Pé Frio) são por MAPA, na ordem dos mixes e dos mapas.
 *   Mapa sem placar ou empatado não conta e não quebra a sequência.
 * - Ranking = o mesmo da página Rankings: ELO, desempate pela taxa de vitória
 *   nos mixes, depois mais mixes e por fim o id (determinístico).
 * - Bolão: só contam mixes com palpites; pontos conferidos pelo resultado
 *   oficial (src/lib/bolao.ts). Quem só palpita também ganha insígnias.
 */

export type BadgeRule =
  | "win_streak"
  | "loss_streak"
  | "ranking_leader"
  | "latest_mvp"
  | "rank_climber"
  | "consistent"
  | "map_king"
  | "veteran"
  | "latest_lanterna"
  | "lanterna_streak"
  | "latest_top_kills"
  | "latest_top_adr"
  | "latest_top_kdr"
  | "latest_top_fk"
  | "latest_top_assists"
  | "latest_top_deaths"
  | "latest_low_fk"
  | "bolao_leader"
  | "bolao_spectator"
  | "bolao_perfect"
  | "bolao_miss_streak"
  | "bolao_zero";

/** Destaques do último mix (os mesmos cards de "Destaques da partida"). */
export const TOP_RULES = {
  latest_top_kills: { key: "kills", label: "Maior matador", goal: "Ter mais kills no próximo mix" },
  latest_top_adr: { key: "adr", label: "Maior ADR", goal: "Ter o maior ADR no próximo mix" },
  latest_top_kdr: { key: "kdr", label: "Maior KDR", goal: "Ter o maior KDR no próximo mix" },
  latest_top_fk: { key: "fk", label: "Mais first kills", goal: "Ter mais first kills no próximo mix" },
  latest_top_assists: { key: "assists", label: "Mais assistências", goal: "Ter mais assistências no próximo mix" },
  latest_top_deaths: { key: "deaths", label: "Mais mortes", goal: "Morrer mais vezes no próximo mix" },
  latest_low_fk: { key: "lowfk", label: "Menos first kills", goal: "Ter menos first kills no próximo mix" },
} as const;
export type TopKey = (typeof TOP_RULES)[keyof typeof TOP_RULES]["key"];

export const BADGE_RULES: Record<
  BadgeRule,
  { label: string; kind: "dynamic" | "permanent"; defaults: Record<string, number>; priority: number }
> = {
  ranking_leader: { label: "Liderança do ranking", kind: "dynamic", defaults: { min_mixes: 3 }, priority: 100 },
  map_king: { label: "Melhor em um mapa", kind: "dynamic", defaults: { min_maps: 5, min_win_rate: 60 }, priority: 90 },
  win_streak: { label: "Vitórias seguidas", kind: "dynamic", defaults: { n: 3 }, priority: 85 },
  consistent: { label: "Consistência", kind: "dynamic", defaults: { mixes: 10, min_rating: 0.9 }, priority: 80 },
  rank_climber: { label: "Subida no ranking", kind: "dynamic", defaults: { positions: 5, window: 4 }, priority: 75 },
  latest_mvp: { label: "MVP do último mix", kind: "dynamic", defaults: {}, priority: 70 },
  veteran: { label: "Mixes jogados", kind: "permanent", defaults: { mixes: 50 }, priority: 60 },
  loss_streak: { label: "Derrotas seguidas", kind: "dynamic", defaults: { n: 3 }, priority: 30 },
  latest_lanterna: { label: "Lanterna do último mix", kind: "dynamic", defaults: {}, priority: 25 },
  lanterna_streak: { label: "Lanterna em mixes seguidos", kind: "dynamic", defaults: { n: 3 }, priority: 20 },
  latest_top_kills: {
    label: TOP_RULES.latest_top_kills.label + " do último mix",
    kind: "dynamic",
    defaults: {},
    priority: 69,
  },
  latest_top_adr: {
    label: TOP_RULES.latest_top_adr.label + " do último mix",
    kind: "dynamic",
    defaults: {},
    priority: 68,
  },
  latest_top_kdr: {
    label: TOP_RULES.latest_top_kdr.label + " do último mix",
    kind: "dynamic",
    defaults: {},
    priority: 67,
  },
  latest_top_fk: {
    label: TOP_RULES.latest_top_fk.label + " do último mix",
    kind: "dynamic",
    defaults: {},
    priority: 66,
  },
  latest_top_assists: {
    label: TOP_RULES.latest_top_assists.label + " do último mix",
    kind: "dynamic",
    defaults: {},
    priority: 65,
  },
  latest_top_deaths: {
    label: TOP_RULES.latest_top_deaths.label + " do último mix",
    kind: "dynamic",
    defaults: {},
    priority: 22,
  },
  latest_low_fk: {
    label: TOP_RULES.latest_low_fk.label + " do último mix",
    kind: "dynamic",
    defaults: {},
    priority: 21,
  },
  bolao_leader: { label: "Liderança do bolão", kind: "dynamic", defaults: { min_bets: 3 }, priority: 45 },
  bolao_perfect: { label: "Gabaritar o bolão", kind: "permanent", defaults: {}, priority: 44 },
  bolao_spectator: { label: "Palpitar sem jogar", kind: "dynamic", defaults: { n: 3 }, priority: 35 },
  bolao_miss_streak: { label: "Errar o vencedor seguido", kind: "dynamic", defaults: { n: 3 }, priority: 19 },
  bolao_zero: { label: "Zerar o último bolão", kind: "dynamic", defaults: {}, priority: 18 },
};

/** Prioridade para mostrar no PICK (manuais ficam no meio). */
export const MANUAL_BADGE_PRIORITY = 50;

export interface EngineRecord {
  userId: string;
  team: "A" | "B";
  kills: number;
  deaths: number;
  assists: number;
  adr: number | null;
  kast: number | null;
  isMvp: boolean;
  /** Pior desempenho do mix (o mesmo “lanterna” das estatísticas). */
  isLanterna?: boolean;
  eloAfter: number | null;
}

export interface EngineMatch {
  id: string;
  /** AAAA-MM-DD */
  date: string;
  finalizedAt: string;
  maps: { mapId: string; scoreA: number | null; scoreB: number | null }[];
  records: EngineRecord[];
  /**
   * Destaques da partida (calculados com todos os jogadores, inclusive
   * convidados, pela mesma função da página do mix). `null` = ninguém com conta.
   */
  tops?: Partial<Record<TopKey, string | null>>;
  /** Palpites do bolão deste mix, já conferidos. */
  bets?: EngineBet[];
  /** Todos os jogadores com conta neste mix (inclusive sem ELO aplicado). */
  participants?: string[];
}

export interface EngineBet {
  userId: string;
  score: PredictionScore;
  /** O mix teve vencedor (empate não conta para acerto nem erro do vencedor). */
  decided: boolean;
}

export interface EngineBadge {
  id: string;
  rule: BadgeRule;
  params?: Record<string, unknown>;
}

export interface EngineInput {
  matches: EngineMatch[];
  badges: EngineBadge[];
  /** ELO atual (profiles.elo): decide o líder agora, incluindo ajustes manuais. */
  currentElo?: Map<string, number>;
  /** Momento do cálculo (ISO), usado só quando o líder muda por ajuste manual. */
  now?: string;
  mapNames?: Record<string, string>;
}

export interface DerivedBadge {
  userId: string;
  badgeId: string;
  sourceRef: string;
  scope: string;
  activatedAt: string;
  deactivatedAt: string | null;
  reason: string;
  endReason: string | null;
}

export interface BadgeProgress {
  userId: string;
  badgeId: string;
  current: number;
  target: number;
  /** O que falta, em texto (ex.: "3º no ranking · faltam 120 de ELO"). */
  detail: string;
}

const at = (date: string) => `${date}T23:00:00.000Z`;
const ddmm = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;

function param(badge: EngineBadge, key: string) {
  const v = badge.params?.[key];
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : BADGE_RULES[badge.rule].defaults[key]!;
}

/** Ordem cronológica estável dos resultados. */
export function sortMatches(matches: EngineMatch[]) {
  return [...matches].sort(
    (a, b) => a.date.localeCompare(b.date) || a.finalizedAt.localeCompare(b.finalizedAt) || a.id.localeCompare(b.id),
  );
}

export function computeBadges(input: EngineInput): { rows: DerivedBadge[]; progress: BadgeProgress[] } {
  const rows: DerivedBadge[] = [];
  const open = new Map<string, DerivedBadge>();
  const key = (badgeId: string, userId: string, scope = "") => `${badgeId}|${userId}|${scope}`;
  const start = (b: EngineBadge, userId: string, ref: string, when: string, reason: string, scope = "") => {
    const k = key(b.id, userId, scope);
    if (open.has(k)) return;
    const row: DerivedBadge = {
      userId,
      badgeId: b.id,
      sourceRef: `${b.rule}:${scope}:${ref}`,
      scope,
      activatedAt: when,
      deactivatedAt: null,
      reason,
      endReason: null,
    };
    rows.push(row);
    open.set(k, row);
  };
  const stop = (b: EngineBadge, userId: string, when: string, reason: string, scope = "") => {
    const k = key(b.id, userId, scope);
    const row = open.get(k);
    if (!row) return;
    row.deactivatedAt = when;
    row.endReason = reason;
    open.delete(k);
  };
  const holders = (b: EngineBadge, scope = "") =>
    [...open.values()].filter((r) => r.badgeId === b.id && r.scope === scope).map((r) => r.userId);

  const byRule = (rule: BadgeRule) => input.badges.filter((b) => b.rule === rule);
  const mapName = (id: string) => input.mapNames?.[id] ?? id.replace(/^de_/, "").replace(/^\w/, (c) => c.toUpperCase());

  // Estado acumulado por jogador.
  const winStreak = new Map<string, number>();
  const lanternaStreak = new Map<string, number>();
  const lossStreak = new Map<string, number>();
  const mixes = new Map<string, number>();
  const seriesWins = new Map<string, number>();
  const elo = new Map<string, number>();
  const ratings = new Map<string, (number | null)[]>();
  const mapStats = new Map<string, Map<string, { played: number; won: number }>>();
  const positions: Map<string, number>[] = [];
  // Bolão.
  const bolaoScores: { userId: string; score: PredictionScore }[] = [];
  const bettors = new Set<string>();
  const spectatorStreak = new Map<string, number>();
  const missStreak = new Map<string, number>();
  const bestBet = new Map<string, number>();

  const standings = (eloOf: (u: string) => number | undefined) =>
    [...mixes.keys()]
      .filter((u) => eloOf(u) != null)
      .sort((a, b) => {
        const wr = (u: string) => (seriesWins.get(u) ?? 0) / Math.max(mixes.get(u) ?? 1, 1);
        return (
          eloOf(b)! - eloOf(a)! || wr(b) - wr(a) || (mixes.get(b) ?? 0) - (mixes.get(a) ?? 0) || a.localeCompare(b)
        );
      });

  for (const match of sortMatches(input.matches)) {
    const when = at(match.date);
    const label = ddmm(match.date);
    const records = match.records;
    const valid = match.maps
      .map((m, i) => ({ ...m, order: i + 1 }))
      .filter((m) => m.scoreA != null && m.scoreB != null && m.scoreA !== m.scoreB);
    const rounds = match.maps.reduce((s, m) => s + (m.scoreA ?? 0) + (m.scoreB ?? 0), 0);

    // Sequências por mapa.
    for (const m of valid) {
      const winner = m.scoreA! > m.scoreB! ? "A" : "B";
      for (const r of records) {
        const won = r.team === winner;
        const ws = won ? (winStreak.get(r.userId) ?? 0) + 1 : 0;
        const ls = won ? 0 : (lossStreak.get(r.userId) ?? 0) + 1;
        winStreak.set(r.userId, ws);
        lossStreak.set(r.userId, ls);
        const where = `${mapName(m.mapId)} em ${label}`;
        for (const b of byRule("win_streak")) {
          const n = param(b, "n");
          if (won && ws >= n)
            start(b, r.userId, `${match.id}:${m.order}`, when, `${n} vitórias seguidas (até ${where})`);
          if (!won) stop(b, r.userId, when, `Sequência quebrada: derrota em ${where}`);
        }
        for (const b of byRule("loss_streak")) {
          const n = param(b, "n");
          if (!won && ls >= n)
            start(b, r.userId, `${match.id}:${m.order}`, when, `${n} derrotas seguidas (até ${where})`);
          if (won) stop(b, r.userId, when, `Sequência encerrada: vitória em ${where}`);
        }
      }
      // Desempenho por mapa (Rei do Mapa).
      for (const r of records) {
        const per = mapStats.get(m.mapId) ?? new Map();
        const s = per.get(r.userId) ?? { played: 0, won: 0 };
        s.played++;
        if (r.team === winner) s.won++;
        per.set(r.userId, s);
        mapStats.set(m.mapId, per);
      }
    }

    // Mixes jogados, vitórias na série, ELO e nota.
    const won = { A: 0, B: 0 };
    for (const m of valid) won[m.scoreA! > m.scoreB! ? "A" : "B"]++;
    for (const r of records) {
      mixes.set(r.userId, (mixes.get(r.userId) ?? 0) + 1);
      const other = r.team === "A" ? "B" : "A";
      if (won[r.team] > won[other]) seriesWins.set(r.userId, (seriesWins.get(r.userId) ?? 0) + 1);
      if (r.eloAfter != null) elo.set(r.userId, r.eloAfter);
      const list = ratings.get(r.userId) ?? [];
      list.push(
        approxRating({ kills: r.kills, deaths: r.deaths, assists: r.assists, rounds, adr: r.adr, kast: r.kast }),
      );
      ratings.set(r.userId, list);
    }

    // MVP do último mix.
    const mvp = records.find((r) => r.isMvp)?.userId ?? null;
    for (const b of byRule("latest_mvp")) {
      for (const u of holders(b)) {
        if (u !== mvp) stop(b, u, when, mvp ? `Novo MVP no mix de ${label}` : `Mix de ${label} sem MVP`);
      }
      if (mvp) start(b, mvp, match.id, when, `MVP do mix de ${label}`);
    }

    // Lanterna do último mix (como o MVP, só que do outro lado da tabela).
    const lanterna = records.find((r) => r.isLanterna)?.userId ?? null;
    for (const b of byRule("latest_lanterna")) {
      for (const u of holders(b)) {
        if (u !== lanterna)
          stop(b, u, when, lanterna ? `Novo lanterna no mix de ${label}` : `Mix de ${label} sem lanterna`);
      }
      if (lanterna) start(b, lanterna, match.id, when, `Lanterna do mix de ${label}`);
    }

    // Destaques do último mix (maior matador, ADR, KDR, first kills, assistências, mortes).
    for (const [rule, cfg] of Object.entries(TOP_RULES) as [
      keyof typeof TOP_RULES,
      (typeof TOP_RULES)[keyof typeof TOP_RULES],
    ][]) {
      const top = match.tops?.[cfg.key] ?? null;
      for (const b of byRule(rule)) {
        for (const u of holders(b)) {
          if (u !== top) stop(b, u, when, `Outro jogador foi o ${cfg.label.toLowerCase()} no mix de ${label}`);
        }
        if (top) start(b, top, match.id, when, `${cfg.label} do mix de ${label}`);
      }
    }

    // Lanterna em mixes seguidos (contando só os mixes que o jogador jogou).
    for (const r of records) {
      const n = r.isLanterna ? (lanternaStreak.get(r.userId) ?? 0) + 1 : 0;
      lanternaStreak.set(r.userId, n);
      for (const b of byRule("lanterna_streak")) {
        const target = param(b, "n");
        if (n >= target) start(b, r.userId, match.id, when, `Lanterna em ${target} mixes seguidos (até ${label})`);
        if (!r.isLanterna) stop(b, r.userId, when, `Saiu da lanterna no mix de ${label}`);
      }
    }

    // Ranking (líder e subida).
    const order = standings((u) => elo.get(u));
    const pos = new Map(order.map((u, i) => [u, i + 1]));
    positions.push(pos);
    for (const b of byRule("ranking_leader")) {
      const leader = order.find((u) => (mixes.get(u) ?? 0) >= param(b, "min_mixes")) ?? null;
      for (const u of holders(b)) {
        if (u !== leader) stop(b, u, when, `Perdeu a liderança no mix de ${label}`);
      }
      if (leader) start(b, leader, `leader:${match.id}`, when, `1º do ranking após o mix de ${label}`);
    }
    for (const b of byRule("rank_climber")) {
      const window = param(b, "window");
      const before = positions.length > window ? positions[positions.length - 1 - window]! : null;
      for (const u of order) {
        const old = before?.get(u);
        const now = pos.get(u)!;
        const rise = old != null ? old - now : 0;
        if (rise >= param(b, "positions")) {
          start(b, u, match.id, when, `Subiu de ${old}º para ${now}º em ${window} mixes`);
        } else {
          stop(b, u, when, `Subida abaixo de ${param(b, "positions")} posições em ${window} mixes (${label})`);
        }
      }
    }

    // Consistência: só muda para quem jogou este mix.
    for (const b of byRule("consistent")) {
      const n = param(b, "mixes");
      const min = param(b, "min_rating");
      for (const r of records) {
        const last = (ratings.get(r.userId) ?? []).slice(-n);
        const ok = last.length === n && last.every((x) => x != null && x >= min);
        if (ok) start(b, r.userId, match.id, when, `Nota ${min.toFixed(2)}+ nos ${n} últimos mixes (até ${label})`);
        else stop(b, r.userId, when, `Nota abaixo de ${min.toFixed(2)} ou sem nota no mix de ${label}`);
      }
    }

    // Rei do Mapa: recalcula os mapas jogados neste mix.
    for (const b of byRule("map_king")) {
      for (const mapId of new Set(valid.map((m) => m.mapId))) {
        const per = mapStats.get(mapId) ?? new Map<string, { played: number; won: number }>();
        const best =
          [...per.entries()]
            .filter(([, s]) => s.played >= param(b, "min_maps") && (s.won / s.played) * 100 >= param(b, "min_win_rate"))
            .sort(
              ([ua, a], [ub, c]) => c.won / c.played - a.won / a.played || c.played - a.played || ua.localeCompare(ub),
            )[0] ?? null;
        const king = best?.[0] ?? null;
        for (const u of holders(b, mapId)) {
          if (u !== king) stop(b, u, when, `Perdeu o posto em ${mapName(mapId)} no mix de ${label}`, mapId);
        }
        if (best) {
          const s = best[1];
          start(
            b,
            best[0],
            `${match.id}`,
            when,
            `${mapName(mapId)}: ${s.won}V ${s.played - s.won}D (${Math.round((s.won / s.played) * 100)}%)`,
            mapId,
          );
        }
      }
    }

    // Bolão (só mixes que tiveram palpites).
    const bets = match.bets ?? [];
    if (bets.length) {
      const played = new Set(match.participants ?? records.map((r) => r.userId));
      for (const bet of bets) {
        bettors.add(bet.userId);
        bolaoScores.push({ userId: bet.userId, score: bet.score });
        bestBet.set(bet.userId, Math.max(bestBet.get(bet.userId) ?? 0, bet.score.points));
      }
      const betOf = new Map(bets.map((b) => [b.userId, b]));

      // Rei do Pitaco: 1º no ranking do bolão.
      const ranking = bolaoRanking(bolaoScores);
      for (const b of byRule("bolao_leader")) {
        const leader = ranking.find((r) => r.bets >= param(b, "min_bets") && r.points > 0) ?? null;
        for (const u of holders(b)) {
          if (u !== leader?.userId) stop(b, u, when, `Perdeu a liderança do bolão no mix de ${label}`);
        }
        if (leader)
          start(b, leader.userId, `leader:${match.id}`, when, `1º do bolão com ${leader.points} pontos (até ${label})`);
      }

      // Alambrado: palpita em mixes seguidos sem jogar.
      for (const u of bettors) {
        const bet = betOf.get(u);
        const n = bet && !played.has(u) ? (spectatorStreak.get(u) ?? 0) + 1 : 0;
        spectatorStreak.set(u, n);
        for (const b of byRule("bolao_spectator")) {
          const target = param(b, "n");
          if (n >= target) start(b, u, match.id, when, `Palpitou em ${target} mixes seguidos sem jogar (até ${label})`);
          if (!n) stop(b, u, when, bet ? `Jogou o mix de ${label}` : `Não palpitou no mix de ${label}`);
        }
      }

      for (const bet of bets) {
        // Mãe Diná (permanente): gabaritou um bolão.
        if (bet.score.points >= BOLAO_MAX)
          for (const b of byRule("bolao_perfect"))
            start(b, bet.userId, "gabarito", when, `Gabaritou o bolão do mix de ${label} (${BOLAO_MAX} pontos)`);
        // Zicado: errou o vencedor em bolões seguidos (empate não conta).
        if (!bet.decided) continue;
        const n = bet.score.winner ? 0 : (missStreak.get(bet.userId) ?? 0) + 1;
        missStreak.set(bet.userId, n);
        for (const b of byRule("bolao_miss_streak")) {
          const target = param(b, "n");
          if (n >= target)
            start(b, bet.userId, match.id, when, `Errou o vencedor em ${target} bolões seguidos (até ${label})`);
          if (!n) stop(b, bet.userId, when, `Acertou o vencedor no mix de ${label}`);
        }
      }

      // Chutômetro Quebrado: zerou o bolão mais recente.
      const zeros = new Set(bets.filter((bet) => bet.score.points === 0).map((bet) => bet.userId));
      for (const b of byRule("bolao_zero")) {
        for (const u of holders(b)) if (!zeros.has(u)) stop(b, u, when, `Pontuou no bolão do mix de ${label}`);
        for (const u of zeros) start(b, u, match.id, when, `0 pontos no bolão do mix de ${label}`);
      }
    }

    // Veterano (permanente: nunca é encerrada).
    for (const b of byRule("veteran")) {
      const n = param(b, "mixes");
      for (const r of records) {
        if (mixes.get(r.userId) === n) start(b, r.userId, "marco", when, `${n} mixes concluídos (em ${label})`);
      }
    }
  }

  // Ajuste manual de ELO depois do último mix: o líder segue o ranking atual.
  if (input.currentElo && input.now) {
    const order = standings((u) => input.currentElo!.get(u) ?? elo.get(u));
    for (const b of byRule("ranking_leader")) {
      const leader = order.find((u) => (mixes.get(u) ?? 0) >= param(b, "min_mixes")) ?? null;
      for (const u of holders(b)) if (u !== leader) stop(b, u, input.now, "Perdeu a liderança (ajuste de ELO)");
      if (leader) start(b, leader, `leader:atual:${leader}`, input.now, "1º do ranking (ajuste de ELO)");
    }
  }

  // Progresso atual de todas as regras (o perfil mostra das que o jogador ainda não tem).
  const progress: BadgeProgress[] = [];
  const push = (u: string, b: EngineBadge, current: number, target: number, detail: string) =>
    progress.push({
      userId: u,
      badgeId: b.id,
      current: Math.max(0, Math.min(Math.round(current), target)),
      target: Math.max(1, Math.round(target)),
      detail,
    });
  const finalOrder = standings((u) => input.currentElo?.get(u) ?? elo.get(u));
  const finalPos = new Map(finalOrder.map((u, i) => [u, i + 1]));
  const eloNow = (u: string) => input.currentElo?.get(u) ?? elo.get(u) ?? 0;
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

  for (const u of mixes.keys()) {
    const played = mixes.get(u) ?? 0;
    for (const b of byRule("win_streak")) {
      const n = param(b, "n");
      const cur = winStreak.get(u) ?? 0;
      push(u, b, cur, n, `${Math.min(cur, n)} de ${n} mapas vencidos seguidos`);
    }
    for (const b of byRule("loss_streak")) {
      const n = param(b, "n");
      const cur = lossStreak.get(u) ?? 0;
      push(u, b, cur, n, `${Math.min(cur, n)} de ${n} mapas perdidos seguidos`);
    }
    for (const b of byRule("lanterna_streak")) {
      const n = param(b, "n");
      const cur = lanternaStreak.get(u) ?? 0;
      push(u, b, cur, n, `Lanterna em ${Math.min(cur, n)} de ${n} mixes seguidos`);
    }
    for (const b of byRule("consistent")) {
      const n = param(b, "mixes");
      const min = param(b, "min_rating");
      const list = ratings.get(u) ?? [];
      let streak = 0;
      for (let i = list.length - 1; i >= 0 && list[i] != null && list[i]! >= min; i--) streak++;
      push(
        u,
        b,
        streak,
        n,
        `${Math.min(streak, n)} de ${n} mixes seguidos com nota ${min.toFixed(2).replace(".", ",")}+`,
      );
    }
    for (const b of byRule("veteran")) {
      const n = param(b, "mixes");
      push(u, b, played, n, `${Math.min(played, n)} de ${n} mixes concluídos`);
    }
    for (const b of byRule("ranking_leader")) {
      const min = param(b, "min_mixes");
      const pos = finalPos.get(u);
      const leader = finalOrder.find((x) => (mixes.get(x) ?? 0) >= min);
      if (played < min) {
        push(
          u,
          b,
          played,
          min,
          `Faltam ${plural(min - played, "mix", "mixes")} para entrar na disputa (mínimo ${min})`,
        );
      } else if (leader && pos) {
        const gap = Math.max(0, eloNow(leader) - eloNow(u));
        push(u, b, eloNow(u), Math.max(eloNow(leader), 1), `${pos}º no ranking · faltam ${gap} de ELO para o 1º`);
      }
    }
    for (const b of byRule("rank_climber")) {
      const window = param(b, "window");
      const need = param(b, "positions");
      const before = positions.length > window ? positions[positions.length - 1 - window]! : null;
      const old = before?.get(u);
      const now = positions[positions.length - 1]?.get(u);
      const rise = old != null && now != null ? Math.max(0, old - now) : 0;
      push(
        u,
        b,
        rise,
        need,
        before
          ? `Subiu ${plural(rise, "posição", "posições")} de ${need} nos últimos ${window} mixes`
          : `Precisa de ${window} mixes de histórico`,
      );
    }
    for (const b of byRule("latest_mvp")) {
      push(u, b, 0, 1, "Ser o MVP do próximo mix");
    }
    for (const b of byRule("latest_lanterna")) {
      push(u, b, 0, 1, "Ser o lanterna do próximo mix");
    }
    for (const [rule, cfg] of Object.entries(TOP_RULES) as [
      keyof typeof TOP_RULES,
      (typeof TOP_RULES)[keyof typeof TOP_RULES],
    ][]) {
      for (const b of byRule(rule)) push(u, b, 0, 1, cfg.goal);
    }
    for (const b of byRule("map_king")) {
      const minMaps = param(b, "min_maps");
      const minRate = param(b, "min_win_rate");
      // O mapa em que o jogador está mais perto do posto: mais jogado, depois melhor aproveitamento.
      const mine = [...mapStats.entries()]
        .map(([mapId, per]) => ({ mapId, s: per.get(u) }))
        .filter((x): x is { mapId: string; s: { played: number; won: number } } => !!x.s)
        .sort((a, c) => c.s.played - a.s.played || c.s.won / c.s.played - a.s.won / a.s.played)[0];
      if (!mine) continue;
      const rate = Math.round((mine.s.won / mine.s.played) * 100);
      if (mine.s.played < minMaps) {
        push(
          u,
          b,
          mine.s.played,
          minMaps,
          `${mapName(mine.mapId)}: ${mine.s.played} de ${minMaps} partidas para disputar`,
        );
      } else {
        const king = holders(b, mine.mapId).find((x) => x !== u);
        const kingStats = king ? mapStats.get(mine.mapId)?.get(king) : undefined;
        const kingRate = kingStats ? Math.round((kingStats.won / kingStats.played) * 100) : 0;
        const target = Math.max(minRate, kingRate + 1);
        push(
          u,
          b,
          rate,
          target,
          `${mapName(mine.mapId)}: ${rate}% de vitórias · precisa de ${target}%${king ? " para passar o atual rei" : ""}`,
        );
      }
    }
  }
  // Progresso do bolão (inclui quem só palpita).
  const bolaoOrder = bolaoRanking(bolaoScores);
  for (const u of bettors) {
    const mine = bolaoOrder.find((r) => r.userId === u);
    for (const b of byRule("bolao_leader")) {
      const min = param(b, "min_bets");
      const bets = mine?.bets ?? 0;
      const leader = bolaoOrder.find((r) => r.bets >= min && r.points > 0);
      if (bets < min) {
        push(
          u,
          b,
          bets,
          min,
          `Faltam ${plural(min - bets, "palpite", "palpites")} para entrar na disputa (mínimo ${min})`,
        );
      } else if (leader && mine) {
        const pos = bolaoOrder.filter((r) => r.bets >= min).findIndex((r) => r.userId === u) + 1;
        push(
          u,
          b,
          mine.points,
          Math.max(leader.points, 1),
          `${pos}º no bolão · faltam ${Math.max(0, leader.points - mine.points)} pontos para o 1º`,
        );
      }
    }
    for (const b of byRule("bolao_spectator")) {
      const n = param(b, "n");
      const cur = spectatorStreak.get(u) ?? 0;
      push(u, b, cur, n, `${Math.min(cur, n)} de ${n} mixes seguidos palpitando sem jogar`);
    }
    for (const b of byRule("bolao_perfect")) {
      const best = bestBet.get(u) ?? 0;
      push(u, b, best, BOLAO_MAX, `Melhor bolão: ${best} de ${BOLAO_MAX} pontos`);
    }
    for (const b of byRule("bolao_miss_streak")) {
      const n = param(b, "n");
      const cur = missStreak.get(u) ?? 0;
      push(u, b, cur, n, `${Math.min(cur, n)} de ${n} bolões seguidos errando o vencedor`);
    }
    for (const b of byRule("bolao_zero")) push(u, b, 0, 1, "Zerar o próximo bolão");
  }
  return { rows, progress };
}
