/** Testes do bolão: `npm run test:bolao`. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  betKindOf,
  BOLAO_MAX,
  bolaoRanking,
  kindOf,
  outcomeOf,
  scorePrediction,
  type MixOutcome,
  type Prediction,
} from "./bolao";

const teams: Record<string, "A" | "B"> = { capA: "A", a2: "A", capB: "B", b2: "B" };
const teamOf = (id: string) => teams[id] ?? null;

const bet = (over: Partial<Prediction> = {}): Prediction => ({
  userId: "u1",
  winnerCaptain: "capA",
  kind: "close",
  mvpId: "a2",
  lanternaId: "b2",
  ...over,
});

const outcome = (over: Partial<MixOutcome> = {}): MixOutcome => ({
  winnerCaptain: "capA",
  kind: "close",
  mapsWon: 2,
  mapsLost: 1,
  mvpId: "a2",
  lanternaId: "b2",
  ...over,
});

const maps = (...scores: [number, number][]) => scores.map(([scoreA, scoreB]) => ({ scoreA, scoreB }));

describe("kindOf", () => {
  it("vitória seca, com deslize e empate, com qualquer número de mapas", () => {
    assert.equal(kindOf(3, 0), "sweep");
    assert.equal(kindOf(4, 0), "sweep");
    assert.equal(kindOf(2, 0), "sweep");
    assert.equal(kindOf(2, 1), "close");
    assert.equal(kindOf(3, 1), "close");
    assert.equal(kindOf(2, 2), "draw");
    assert.equal(kindOf(1, 1), "draw");
  });
});

describe("betKindOf (palpites gravados)", () => {
  it("usa o tipo gravado; palpites antigos saem do placar", () => {
    assert.equal(betKindOf({ kind: "draw", winner_captain: null }), "draw");
    assert.equal(betKindOf({ winner_captain: "capA", maps_won: 3, maps_lost: 0 }), "sweep");
    assert.equal(betKindOf({ winner_captain: "capA", maps_won: 2, maps_lost: 1 }), "close");
    assert.equal(betKindOf({ winner_captain: null }), "draw");
  });
});

describe("outcomeOf", () => {
  it("vencedor pelos mapas, pelo time em que o capitão jogou", () => {
    const o = outcomeOf({
      maps: maps([13, 11], [9, 13], [13, 5]),
      teamOf,
      captains: ["capA", "capB"],
      mvpId: "a2",
      lanternaId: "b2",
    });
    assert.deepEqual(o, outcome());
  });

  it("4 mapas: 3×1 é com deslize e 4×0 é seca", () => {
    const base = { teamOf, captains: ["capA", "capB"] as [string, string], mvpId: null, lanternaId: null };
    assert.equal(outcomeOf({ ...base, maps: maps([13, 5], [13, 9], [7, 13], [13, 2]) }).kind, "close");
    assert.equal(outcomeOf({ ...base, maps: maps([13, 5], [13, 9], [13, 7], [13, 2]) }).kind, "sweep");
  });

  it("segue o capitão mesmo se os times trocaram de letra na finalização", () => {
    const o = outcomeOf({
      maps: maps([13, 2]),
      teamOf: (id) => (id === "capB" ? "A" : id === "capA" ? "B" : null),
      captains: ["capA", "capB"],
      mvpId: null,
      lanternaId: null,
    });
    assert.equal(o.winnerCaptain, "capB");
    assert.equal(o.kind, "sweep");
  });

  it("2×2 é empate, sem vencedor", () => {
    const o = outcomeOf({
      maps: maps([13, 10], [16, 13], [6, 13], [13, 16]),
      teamOf,
      captains: ["capA", "capB"],
      mvpId: null,
      lanternaId: null,
    });
    assert.equal(o.winnerCaptain, null);
    assert.equal(o.kind, "draw");
  });

  it("sem mapa decidido: sem resultado", () => {
    const o = outcomeOf({
      maps: [{ scoreA: null, scoreB: null }],
      teamOf,
      captains: ["capA", "capB"],
      mvpId: null,
      lanternaId: null,
    });
    assert.equal(o.kind, null);
  });
});

describe("scorePrediction", () => {
  it("acerto total vale o máximo", () => {
    assert.equal(scorePrediction(bet(), outcome()).points, BOLAO_MAX);
  });

  it("tipo certo com vencedor errado não pontua o tipo", () => {
    const s = scorePrediction(bet({ winnerCaptain: "capB", mvpId: null, lanternaId: null }), outcome());
    assert.deepEqual(s, { points: 0, winner: false, score: false, mvp: false, lanterna: false });
  });

  it("só o vencedor: 3 pontos", () => {
    const s = scorePrediction(bet({ kind: "sweep", mvpId: "capB", lanternaId: null }), outcome());
    assert.equal(s.points, 3);
  });

  it("2×1 e 3×1 contam igual (com deslize)", () => {
    const s = scorePrediction(bet(), outcome({ mapsWon: 3, mapsLost: 1 }));
    assert.equal(s.score, true);
  });

  it("MVP e lanterna valem mesmo errando o vencedor", () => {
    const s = scorePrediction(bet({ winnerCaptain: "capB" }), outcome());
    assert.equal(s.points, 5);
  });

  it("empate certo vale resultado e tipo (5 pontos)", () => {
    const s = scorePrediction(
      bet({ winnerCaptain: null, kind: "draw", mvpId: null, lanternaId: null }),
      outcome({ winnerCaptain: null, kind: "draw", mapsWon: 2, mapsLost: 2 }),
    );
    assert.deepEqual(s, { points: 5, winner: true, score: true, mvp: false, lanterna: false });
  });

  it("mix empatado: quem apostou num time não pontua o resultado", () => {
    const s = scorePrediction(bet(), outcome({ winnerCaptain: null, kind: "draw", mapsWon: 2, mapsLost: 2 }));
    assert.equal(s.winner, false);
    assert.equal(s.score, false);
  });

  it("apostou empate e um time venceu: não pontua o resultado", () => {
    const s = scorePrediction(bet({ winnerCaptain: null, kind: "draw" }), outcome());
    assert.equal(s.winner, false);
  });
});

describe("bolaoRanking", () => {
  it("ordena por pontos, tipos certos, MVPs e menos palpites", () => {
    const o = outcome();
    const rows = bolaoRanking([
      { userId: "x", score: scorePrediction(bet({ userId: "x", mvpId: null, lanternaId: null }), o) },
      { userId: "y", score: scorePrediction(bet({ userId: "y", kind: "sweep" }), o) },
      { userId: "z", score: scorePrediction(bet({ userId: "z" }), o) },
      { userId: "x", score: scorePrediction(bet({ userId: "x", winnerCaptain: "capB", mvpId: null }), o) },
    ]);
    assert.deepEqual(
      rows.map((r) => [r.userId, r.points, r.bets]),
      [
        ["z", 10, 1],
        ["y", 8, 1],
        ["x", 7, 2],
      ],
    );
  });
});
