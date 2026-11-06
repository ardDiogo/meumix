/** Testes de resultados e classificação: `npm run test:campeonato`. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { homeSideOf, sanitizeGcMap } from "./championship-gc";
import { mapScoreProblem, seriesState, standings, type ResultMatch } from "./championship-standings";

const md1 = (home: string, away: string, h: number, a: number): ResultMatch => ({
  home,
  away,
  bestOf: 1,
  maps: [{ home: h, away: a }],
});
const PTS = { pointsWin: 3, pointsLoss: 0 };

describe("placar e série", () => {
  it("valida o placar do mapa", () => {
    assert.equal(mapScoreProblem({ home: 13, away: 9 }), null);
    assert.equal(mapScoreProblem({ home: 16, away: 14 }), null);
    assert.equal(mapScoreProblem({ home: 13, away: 0 }), null, "W.O.");
    assert.match(mapScoreProblem({ home: 12, away: 12 })!, /empatado/);
    assert.match(mapScoreProblem({ home: 12, away: 10 })!, /13 rounds/);
    assert.match(mapScoreProblem({ home: -1, away: 13 })!, /inválido/);
  });
  it("MD3: vencedor com 2 mapas e não cabe o 3º", () => {
    const one = seriesState([{ home: 13, away: 5 }], 3);
    assert.deepEqual([one.home, one.away, one.winner, one.canAddMap], [1, 0, null, true]);
    const two = seriesState(
      [
        { home: 13, away: 5 },
        { home: 13, away: 11 },
      ],
      3,
    );
    assert.deepEqual([two.winner, two.canAddMap], ["home", false]);
    const three = seriesState(
      [
        { home: 13, away: 5 },
        { home: 9, away: 13 },
        { home: 10, away: 13 },
      ],
      3,
    );
    assert.equal(three.winner, "away");
    assert.equal(seriesState([{ home: 5, away: 13 }], 1).winner, "away");
  });
});

describe("classificação", () => {
  const T = ["Snkk", "Beli", "Koder", "Mald", "Marlon"];
  it("pontos, rounds, saldo e aproveitamento", () => {
    const rows = standings(T, [md1("Beli", "Marlon", 13, 9), md1("Koder", "Mald", 7, 13)], PTS);
    const beli = rows.find((r) => r.team === "Beli")!;
    assert.deepEqual(
      { ...beli },
      {
        team: "Beli",
        played: 1,
        wins: 1,
        losses: 0,
        points: 3,
        roundsWon: 13,
        roundsLost: 9,
        roundDiff: 4,
        efficiency: 100,
      },
    );
    assert.deepEqual(
      rows.map((r) => r.team),
      ["Mald", "Beli", "Snkk", "Marlon", "Koder"],
      "Mald (+6) antes de Beli (+4); com 0 pontos, Snkk (saldo 0) antes de quem perdeu",
    );
  });
  it("2 empatados: confronto direto vale mais que o saldo", () => {
    const rows = standings(
      T,
      [
        md1("Beli", "Koder", 13, 11), // Beli vence o direto por pouco
        md1("Koder", "Snkk", 13, 0), // Koder com saldo enorme
        md1("Mald", "Beli", 13, 2), // Beli perde feio
      ],
      PTS,
    );
    const beli = rows.findIndex((r) => r.team === "Beli");
    const koder = rows.findIndex((r) => r.team === "Koder");
    assert.ok(beli < koder, "Beli venceu o confronto direto");
  });
  it("3 empatados: mini-classificação, depois saldo geral", () => {
    // Triangular: A vence B, B vence C, C vence A (cada um 3 pts entre eles); desempata no saldo.
    const rows = standings(["A", "B", "C"], [md1("A", "B", 13, 11), md1("B", "C", 13, 3), md1("C", "A", 13, 10)], PTS);
    assert.deepEqual(
      rows.map((r) => [r.team, r.points, r.roundDiff]),
      [
        ["B", 3, 8],
        ["C", 3, -7],
        ["A", 3, -1],
      ].sort((x, y) => (y[2] as number) - (x[2] as number)),
    );
  });
  it("série em andamento não conta", () => {
    const rows = standings(["A", "B"], [{ home: "A", away: "B", bestOf: 3, maps: [{ home: 13, away: 2 }] }], PTS);
    assert.equal(rows[0]!.played, 0);
  });
  it("empate total: ordem de cadastro", () =>
    assert.deepEqual(
      standings(["X", "Y", "Z"], [], PTS).map((r) => r.team),
      ["X", "Y", "Z"],
    ));
});

describe("partida da GC no campeonato", () => {
  const player = (gcId: string, team: "A" | "B") => ({ gcId, nick: `n${gcId}`, team, k: 10, a: 2, d: 8, rating: 1.1 });
  it("remonta só o que é conhecido e recusa lixo", () => {
    const m = sanitizeGcMap({
      gcMatchId: "28218111",
      scoreA: 13,
      scoreB: 9,
      players: [player("1", "A"), { ...player("2", "B"), steamId: "76561198000000000", evil: "<script>" }],
      rounds: [{ winner: "A", reason: "bomb_defused", aSide: "CT" }, { winner: "X" }],
      clips: [{ gcId: "1", clipId: "bad id!", title: "x" }],
    })!;
    assert.equal(m.players.length, 2);
    assert.equal(m.players[1]!.steamId, "76561198000000000");
    assert.ok(!("evil" in m.players[1]!));
    assert.equal(m.rounds.length, 1);
    assert.equal(m.clips.length, 0);
    assert.equal(sanitizeGcMap({ gcMatchId: "abc", players: [] }), null);
    assert.equal(sanitizeGcMap({ gcMatchId: "1", players: [player("1", "C" as "A")] }), null);
  });
  it("descobre o lado do mandante pelo elenco", () => {
    const home = new Set(["h1", "h2"]);
    const away = new Set(["a1"]);
    assert.equal(
      homeSideOf(
        [
          { team: "A", userId: "a1" },
          { team: "B", userId: "h1" },
          { team: "B", userId: "h2" },
        ],
        home,
        away,
      ),
      "B",
    );
    assert.equal(homeSideOf([{ team: "A", userId: null }], home, away), null);
  });
});
