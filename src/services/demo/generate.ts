/**
 * Gerador de DADOS DEMONSTRATIVOS.
 *
 * Tudo aqui é fictício: jogadores, partidas e estatísticas são gerados de
 * forma determinística (seed fixa) apenas para visualizar a interface.
 * Não importe este módulo fora de `services/demo`.
 */
import { average, DEFAULT_STARTING_ELO, eloDelta } from "@/lib/elo";
import { ACTIVE_MAP_POOL } from "@/lib/maps";
import { balanceTeams } from "@/lib/teams";
import type {
  Community,
  EloHistoryEntry,
  Highlight,
  MapResult,
  Mix,
  Player,
  PlayerMapStats,
  Team,
  TeamSide,
} from "@/types/domain";

/** Data de referência da demo (o "hoje" dos filtros de período). */
export const DEMO_NOW = new Date("2026-10-13T15:00:00Z");
export const DEMO_CURRENT_PLAYER_ID = "p01";

const NICKNAMES = [
  "zecaFX",
  "kraken",
  "vrau",
  "tchelo",
  "m1randa",
  "bigodin",
  "fuegoo",
  "lepo",
  "s1lent",
  "doguinho",
  "rafitos",
  "pastelz",
  "jubileu",
  "trov4o",
  "neblina",
  "capivara",
];

/** PRNG determinístico (mulberry32). */
function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface DemoDataset {
  community: Community;
  players: Player[];
  mixes: Mix[];
  eloHistory: EloHistoryEntry[];
  elos: Map<string, number>;
  highlights: Highlight[];
}

export function generateDemoDataset(): DemoDataset {
  const rand = rng(20261013);
  const between = (min: number, max: number) => min + rand() * (max - min);
  const int = (min: number, max: number) => Math.floor(between(min, max + 1));
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]!;

  const community: Community = {
    id: "c-demo",
    slug: "demo",
    name: "Comunidade Demo",
    description: "Comunidade fictícia usada para demonstrar a plataforma.",
    startingElo: DEFAULT_STARTING_ELO,
    createdAt: "2026-06-01T15:00:00Z",
  };

  const players: Player[] = NICKNAMES.map((nickname, i) => ({
    id: `p${String(i + 1).padStart(2, "0")}`,
    nickname,
    avatarUrl: null,
    steamId: null,
    country: "BR",
    createdAt: "2026-06-01T15:00:00Z",
  }));

  // Habilidade oculta usada apenas para gerar resultados plausíveis.
  const skill = new Map(players.map((p) => [p.id, between(0.82, 1.2)]));
  skill.set(DEMO_CURRENT_PLAYER_ID, 1.08);

  const elos = new Map(players.map((p) => [p.id, community.startingElo]));
  const eloHistory: EloHistoryEntry[] = [];
  const mixes: Mix[] = [];
  const highlights: Highlight[] = [];

  const TOTAL = 30;
  const first = new Date("2026-07-08T00:00:00Z").getTime();
  const step = (DEMO_NOW.getTime() - first) / (TOTAL - 1);

  for (let n = 0; n < TOTAL; n++) {
    const id = `mix-${String(n + 1).padStart(3, "0")}`;
    // 21h/22h em Brasília (00h/01h UTC do dia seguinte).
    const date = new Date(first + step * n);
    date.setUTCHours(int(0, 1), 0, 0, 0);
    const scheduled = n === TOTAL - 1;
    // Próximo mix: daqui a dois dias, 21h em Brasília.
    if (scheduled)
      date.setTime(Date.UTC(DEMO_NOW.getUTCFullYear(), DEMO_NOW.getUTCMonth(), DEMO_NOW.getUTCDate() + 3, 0));

    // Seleção de 10 jogadores (o usuário atual joga ~80% dos mixes).
    const pool = [...players].sort(() => rand() - 0.5);
    let roster = pool.slice(0, 10).map((p) => p.id);
    if (!roster.includes(DEMO_CURRENT_PLAYER_ID) && rand() < 0.8) roster[9] = DEMO_CURRENT_PLAYER_ID;
    roster = [...new Set(roster)];
    while (roster.length < 10) roster.push(pool.find((p) => !roster.includes(p.id))!.id);

    // Mesma regra de divisão usada na criação de mixes.
    const { a, b } = balanceTeams(roster, elos);
    const name = (ids: string[]) => `Time ${players.find((p) => p.id === ids[0])!.nickname}`;
    const teams: [Team, Team] = [
      { side: "A", name: name(a), captainId: a[0]!, playerIds: a },
      { side: "B", name: name(b), captainId: b[0]!, playerIds: b },
    ];

    const organizerIds = [pick(roster)];
    const bo3 = rand() < 0.2;
    const mapIds = [...ACTIVE_MAP_POOL]
      .sort(() => rand() - 0.5)
      .slice(0, bo3 ? 3 : 1)
      .map((m) => m.id);

    const maps: MapResult[] = [];
    const stats: PlayerMapStats[] = [];
    // Os primeiros mixes registram apenas K/A/D — demonstra o preenchimento gradual.
    const advanced = n >= 6;

    if (!scheduled) {
      let winsA = 0;
      let winsB = 0;
      for (const [order, mapId] of mapIds.entries()) {
        if (bo3 && (winsA === 2 || winsB === 2)) break;
        const strengthA = average(a.map((p) => skill.get(p)!));
        const strengthB = average(b.map((p) => skill.get(p)!));
        const winner: TeamSide = strengthA - strengthB + between(-0.25, 0.25) >= 0 ? "A" : "B";
        const ot = rand() < 0.12;
        const loserScore = ot ? 14 + 3 * int(0, 1) : int(3, 11);
        const winnerScore = ot ? loserScore + 2 : 13;
        const rounds = winnerScore + loserScore;
        const [scoreA, scoreB] = winner === "A" ? [winnerScore, loserScore] : [loserScore, winnerScore];
        if (winner === "A") winsA++;
        else winsB++;
        maps.push({ order: order + 1, mapId, scoreA, scoreB, winner });

        const kills = new Map<string, number>();
        for (const team of teams) {
          const won = team.side === winner;
          for (const pid of team.playerIds) {
            kills.set(
              pid,
              Math.max(2, Math.round(rounds * 0.7 * skill.get(pid)! * (won ? 1.1 : 0.88) * between(0.65, 1.35))),
            );
          }
        }
        for (const team of teams) {
          const opponents = teams.find((t) => t !== team)!.playerIds;
          const totalDeaths = opponents.reduce((s, pid) => s + kills.get(pid)!, 0);
          const weights = team.playerIds.map((pid) => (2.1 - skill.get(pid)!) * between(0.7, 1.3));
          const wsum = weights.reduce((s, w) => s + w, 0);
          team.playerIds.forEach((pid, i) => {
            const k = kills.get(pid)!;
            const d = Math.min(rounds, Math.max(3, Math.round((totalDeaths * weights[i]!) / wsum)));
            const row: PlayerMapStats = {
              playerId: pid,
              mapOrder: order + 1,
              side: team.side,
              kills: k,
              assists: int(1, Math.ceil(rounds * 0.22)),
              deaths: d,
            };
            if (advanced) {
              const k3 = rand() < k / 60 ? int(1, 2) : 0;
              const k4 = rand() < k / 220 ? 1 : 0;
              const k5 = rand() < k / 900 ? 1 : 0;
              const clutchesPlayed = int(0, 3);
              const clutchesWon = Math.min(clutchesPlayed, rand() < skill.get(pid)! - 0.6 ? int(1, 2) : 0);
              Object.assign(row, {
                roundsPlayed: rounds,
                damage: Math.round(k * between(88, 108) + row.assists * between(25, 45)),
                kastRounds: Math.min(rounds, Math.round(rounds * between(0.6, 0.8) * Math.min(1.15, skill.get(pid)!))),
                headshotKills: Math.round(k * between(0.3, 0.62)),
                firstKills: Math.round(rounds * 0.1 * skill.get(pid)! * between(0.4, 1.6)),
                firstDeaths: Math.round(rounds * 0.1 * (2 - skill.get(pid)!) * between(0.4, 1.6)),
                multikills: { k2: Math.round(k * between(0.08, 0.16)), k3, k4, k5 },
                clutchesWon,
                clutchesPlayed,
              } satisfies Partial<PlayerMapStats>);
              if (k5)
                highlights.push({
                  id: `hl-${highlights.length + 1}`,
                  mixId: id,
                  playerId: pid,
                  kind: "ace",
                  title: `Ace no mapa ${order + 1}`,
                  url: null,
                  createdAt: date.toISOString(),
                });
              else if (k4)
                highlights.push({
                  id: `hl-${highlights.length + 1}`,
                  mixId: id,
                  playerId: pid,
                  kind: "multikill",
                  title: `4K no mapa ${order + 1}`,
                  url: null,
                  createdAt: date.toISOString(),
                });
              if (clutchesWon >= 2)
                highlights.push({
                  id: `hl-${highlights.length + 1}`,
                  mixId: id,
                  playerId: pid,
                  kind: "clutch",
                  title: `${clutchesWon} clutches vencidos`,
                  url: null,
                  createdAt: date.toISOString(),
                });
            }
            stats.push(row);
          });
        }
      }

      // ELO
      const winner: TeamSide = winsA > winsB ? "A" : "B";
      const delta = eloDelta(
        average(a.map((p) => elos.get(p)!)),
        average(b.map((p) => elos.get(p)!)),
        winner === "A" ? 1 : 0,
      );
      for (const team of teams) {
        const change = team.side === "A" ? delta : -delta;
        for (const pid of team.playerIds) {
          const before = elos.get(pid)!;
          elos.set(pid, before + change);
          eloHistory.push({
            playerId: pid,
            communityId: community.id,
            mixId: id,
            date: date.toISOString(),
            eloBefore: before,
            eloAfter: before + change,
            result: team.side === winner ? "win" : "loss",
          });
        }
      }
    }

    // MVP: melhor saldo no time vencedor.
    let mvpPlayerId: string | null = null;
    if (!scheduled) {
      const winSide =
        maps.filter((m) => m.winner === "A").length > maps.filter((m) => m.winner === "B").length ? "A" : "B";
      const score = (pid: string) =>
        stats.filter((s) => s.playerId === pid).reduce((t, s) => t + s.kills * 2 - s.deaths + s.assists * 0.5, 0);
      mvpPlayerId =
        [...teams.find((t) => t.side === winSide)!.playerIds].sort((x, y) => score(y) - score(x))[0] ?? null;
    }

    mixes.push({
      id,
      communityId: community.id,
      name: `Mix #${n + 1}`,
      scheduledAt: date.toISOString(),
      status: scheduled ? "scheduled" : "finished",
      organizerIds,
      teams,
      maps: scheduled
        ? mapIds.map((mapId, i) => ({ order: i + 1, mapId, scoreA: null, scoreB: null, winner: null }))
        : maps,
      stats,
      mvpPlayerId,
      twitchUrl: null,
      highlightIds: highlights.filter((h) => h.mixId === id).map((h) => h.id),
    });
  }

  return { community, players, mixes: mixes.reverse(), eloHistory, elos, highlights: highlights.reverse() };
}
