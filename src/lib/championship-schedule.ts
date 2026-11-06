/**
 * Confrontos e agenda do campeonato: geração do todos contra todos, janela de
 * dias/horários e conflitos (time em dois jogos, servidores). Funções puras
 * (testes: `npm run test:campeonato`). Horários no fuso de Brasília (UTC−3).
 */

export type MatchStatus =
  "pending" | "proposed" | "approval" | "scheduled" | "live" | "finished" | "postponed" | "cancelled";

export const MATCH_STATUS_LABEL: Record<MatchStatus, string> = {
  pending: "Aguardando agendamento",
  proposed: "Aguardando resposta do adversário",
  approval: "Aguardando aprovação da organização",
  scheduled: "Agendada",
  live: "Em andamento",
  finished: "Finalizada",
  postponed: "Adiada",
  cancelled: "Cancelada",
};

export interface Fixture {
  round: number;
  home: string;
  away: string;
}

/**
 * Calendário do 1º campeonato (5 times, na ordem de cadastro: Snkk, Beli,
 * Koder, Mald, Marlon), em índices: [mandante, visitante] por rodada.
 */
const FIVE_TEAMS: [number, number][][] = [
  [
    [1, 4],
    [2, 3],
  ],
  [
    [0, 4],
    [1, 2],
  ],
  [
    [0, 3],
    [4, 2],
  ],
  [
    [0, 2],
    [3, 1],
  ],
  [
    [0, 1],
    [3, 4],
  ],
];

/**
 * Todos contra todos. Com 5 times usa o calendário publicado; nos outros
 * casos, o método do círculo (número ímpar: um time folga por rodada).
 * Ida e volta repete as rodadas com o mando invertido.
 */
export function roundRobin(teams: string[], double = false): Fixture[] {
  const n = teams.length;
  let single: Fixture[] = [];
  if (n === 5) {
    single = FIVE_TEAMS.flatMap((games, r) =>
      games.map(([h, a]) => ({ round: r + 1, home: teams[h]!, away: teams[a]! })),
    );
  } else if (n >= 2) {
    const list: (string | null)[] = n % 2 ? [...teams, null] : [...teams];
    const m = list.length;
    for (let r = 0; r < m - 1; r++) {
      for (let i = 0; i < m / 2; i++) {
        const a = list[i];
        const b = list[m - 1 - i];
        if (a && b) single.push(r % 2 === 0 ? { round: r + 1, home: a, away: b } : { round: r + 1, home: b, away: a });
      }
      // Gira todos menos o primeiro.
      list.splice(1, 0, list.pop()!);
    }
  }
  if (!double) return single;
  const rounds = Math.max(0, ...single.map((f) => f.round));
  return [...single, ...single.map((f) => ({ round: f.round + rounds, home: f.away, away: f.home }))];
}

/** Times que folgam em cada rodada. */
export function byes(fixtures: Fixture[], teams: string[]) {
  const rounds = [...new Set(fixtures.map((f) => f.round))].sort((a, b) => a - b);
  return Object.fromEntries(
    rounds.map((r) => {
      const playing = new Set(fixtures.filter((f) => f.round === r).flatMap((f) => [f.home, f.away]));
      return [r, teams.filter((t) => !playing.has(t))];
    }),
  ) as Record<number, string[]>;
}

/* --------------------------------- Horário -------------------------------- */

const OFFSET = "-03:00";

/** "2026-11-16T21:30" (horário de Brasília) → ISO em UTC. Null se inválido. */
export function fromLocal(local: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return null;
  const d = new Date(`${local}:00${OFFSET}`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** ISO → "2026-11-16T21:30" em Brasília (para o campo de data e hora). */
export function toLocal(iso: string) {
  const d = new Date(new Date(iso).getTime() - 3 * 3600_000);
  return d.toISOString().slice(0, 16);
}

/** Dia da semana (0 = domingo) e minutos do dia, em Brasília. */
export function localParts(iso: string) {
  const d = new Date(new Date(iso).getTime() - 3 * 3600_000);
  return { weekday: d.getUTCDay(), minutes: d.getUTCHours() * 60 + d.getUTCMinutes() };
}

const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/**
 * O jogo começa dentro da janela? Ex.: segunda e terça, das 21:00 às 23:30.
 * Janela que passa da meia-noite (22:00 às 00:30) vale para a madrugada
 * seguinte a um dia permitido. Começar no horário final não vale.
 */
export function inWindow(iso: string, days: number[], start: string, end: string) {
  const { weekday, minutes } = localParts(iso);
  const s = mins(start);
  const e = mins(end);
  if (s < e) return days.includes(weekday) && minutes >= s && minutes < e;
  if (minutes >= s) return days.includes(weekday);
  return minutes < e && days.includes((weekday + 6) % 7);
}

/** Tempo reservado para um jogo: 75 minutos por mapa possível (MD1 75, MD3 3h45). */
export const matchMinutes = (bestOf: number) => 75 * bestOf;

export interface Booking {
  id: string;
  home: string | null;
  away: string | null;
  startsAt: string;
  bestOf: number;
  server: number | null;
}

const overlaps = (a: Booking, b: Booking) => {
  const a0 = new Date(a.startsAt).getTime();
  const b0 = new Date(b.startsAt).getTime();
  return a0 < b0 + matchMinutes(b.bestOf) * 60_000 && b0 < a0 + matchMinutes(a.bestOf) * 60_000;
};

/**
 * Pode marcar `game` nesse horário? Confere: nenhum dos dois times em outro
 * jogo no mesmo período, servidores livres (no máximo `servers` jogos ao
 * mesmo tempo) e, se informado, o servidor escolhido livre. `others` são os
 * jogos já marcados (aguardando aprovação, agendados ou em andamento).
 */
export function scheduleProblem(
  game: Booking,
  others: Booking[],
  servers: number,
  names: Record<string, string> = {},
): string | null {
  const clash = others.filter((o) => o.id !== game.id && overlaps(game, o));
  const teams = [game.home, game.away].filter((t): t is string => !!t);
  for (const t of teams) {
    const busy = clash.find((o) => o.home === t || o.away === t);
    if (busy) return `O ${names[t] ?? "time"} já tem jogo nesse horário.`;
  }
  if (clash.length >= servers)
    return `Já há ${clash.length} ${clash.length === 1 ? "jogo" : "jogos"} nesse horário (limite de ${servers} servidores).`;
  if (game.server != null && clash.some((o) => o.server === game.server))
    return `O servidor ${game.server} já está em uso nesse horário.`;
  return null;
}

/** Primeiro servidor livre no horário do jogo (1…servers), ou null. */
export function freeServer(game: Booking, others: Booking[], servers: number) {
  const used = new Set(others.filter((o) => o.id !== game.id && overlaps(game, o)).map((o) => o.server));
  for (let s = 1; s <= servers; s++) if (!used.has(s)) return s;
  return null;
}

/** "seg., 16/11 às 21:30" (Brasília). */
export function formatWhen(iso: string) {
  const d = new Date(iso);
  const day = d.toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
  const hour = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
  return `${day} às ${hour}`;
}
