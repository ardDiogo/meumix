/**
 * Resultados e classificação do campeonato. Funções puras (testes:
 * `npm run test:campeonato`). Nada é guardado: tudo sai dos placares dos mapas.
 */

export interface MapScore {
  home: number;
  away: number;
}

/** Placar de mapa válido: inteiros de 0 a 99, sem empate, vencedor com 13 ou mais (MR12, prorrogação, W.O.). */
export function mapScoreProblem(s: MapScore): string | null {
  const ok = (n: number) => Number.isInteger(n) && n >= 0 && n <= 99;
  if (!ok(s.home) || !ok(s.away)) return "Placar inválido (de 0 a 99).";
  if (s.home === s.away) return "Mapa não termina empatado.";
  if (Math.max(s.home, s.away) < 13) return "O vencedor do mapa precisa ter 13 rounds ou mais.";
  return null;
}

/**
 * Situação da série: mapas vencidos por cada lado e o vencedor quando alguém
 * chega à maioria (MD1: 1, MD3: 2, MD5: 3). `extra` diz se ainda cabe mapa.
 */
export function seriesState(maps: MapScore[], bestOf: number) {
  const need = Math.floor(bestOf / 2) + 1;
  const home = maps.filter((m) => m.home > m.away).length;
  const away = maps.filter((m) => m.away > m.home).length;
  const winner = home >= need ? "home" : away >= need ? "away" : null;
  return { home, away, need, winner: winner as "home" | "away" | null, canAddMap: !winner && maps.length < bestOf };
}

export interface ResultMatch {
  home: string;
  away: string;
  bestOf: number;
  maps: MapScore[];
}

export interface StandingRow {
  team: string;
  played: number;
  wins: number;
  losses: number;
  points: number;
  roundsWon: number;
  roundsLost: number;
  roundDiff: number;
  /** % dos pontos possíveis (0 a 100). */
  efficiency: number;
}

/** Só séries decididas contam (vitória = série vencida). */
function decided(matches: ResultMatch[]) {
  return matches.map((m) => ({ ...m, state: seriesState(m.maps, m.bestOf) })).filter((m) => m.state.winner);
}

function table(teams: string[], matches: ResultMatch[], pointsWin: number, pointsLoss: number) {
  const rows = new Map<string, StandingRow>(
    teams.map((t) => [
      t,
      { team: t, played: 0, wins: 0, losses: 0, points: 0, roundsWon: 0, roundsLost: 0, roundDiff: 0, efficiency: 0 },
    ]),
  );
  for (const m of decided(matches)) {
    const h = rows.get(m.home);
    const a = rows.get(m.away);
    if (!h || !a) continue;
    const homeWon = m.state.winner === "home";
    for (const [row, won] of [
      [h, homeWon],
      [a, !homeWon],
    ] as const) {
      row.played++;
      if (won) {
        row.wins++;
        row.points += pointsWin;
      } else {
        row.losses++;
        row.points += pointsLoss;
      }
    }
    for (const map of m.maps) {
      h.roundsWon += map.home;
      h.roundsLost += map.away;
      a.roundsWon += map.away;
      a.roundsLost += map.home;
    }
  }
  for (const r of rows.values()) {
    r.roundDiff = r.roundsWon - r.roundsLost;
    r.efficiency = r.played ? Math.round((r.points / (r.played * pointsWin || 1)) * 100) : 0;
  }
  return rows;
}

/**
 * Classificação com os desempates publicados:
 * 1. pontos;
 * 2. confronto direto (2 empatados) ou mini-classificação entre os empatados (3+);
 * 3. saldo de rounds; 4. rounds vencidos; 5. ordem da lista de times (a do draft; determinístico).
 */
export function standings(
  teams: string[],
  matches: ResultMatch[],
  opts: { pointsWin: number; pointsLoss: number },
): StandingRow[] {
  const all = table(teams, matches, opts.pointsWin, opts.pointsLoss);
  const order = (group: string[]): string[] => {
    if (group.length < 2) return group;
    // Pontos só nos jogos entre os empatados (com 2 times, é o confronto direto).
    const inside = matches.filter((m) => group.includes(m.home) && group.includes(m.away));
    const mini = table(group, inside, opts.pointsWin, opts.pointsLoss);
    return [...group].sort((x, y) => {
      const a = all.get(x)!;
      const b = all.get(y)!;
      return (
        mini.get(y)!.points - mini.get(x)!.points ||
        b.roundDiff - a.roundDiff ||
        b.roundsWon - a.roundsWon ||
        teams.indexOf(x) - teams.indexOf(y)
      );
    });
  };
  const byPoints = new Map<number, string[]>();
  for (const t of teams) {
    const p = all.get(t)!.points;
    byPoints.set(p, [...(byPoints.get(p) ?? []), t]);
  }
  return [...byPoints.keys()]
    .sort((a, b) => b - a)
    .flatMap((p) => order(byPoints.get(p)!))
    .map((t) => all.get(t)!);
}
