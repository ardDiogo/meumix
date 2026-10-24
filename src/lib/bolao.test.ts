/** Testes do bolão: `npm run test:bolao`. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BOLAO_MAX, bolaoRanking, outcomeOf, scoreOptions, scorePrediction, type Prediction } from "./bolao";

const teams: Record<string, "A" | "B"> = { capA: "A", a2: "A", capB: "B", b2: "B" };
const teamOf = (id: string) => teams[id] ?? null;

const bet = (over: Partial<Prediction> = {}): Prediction => ({
  userId: "u1",
  winnerCaptain: "capA",
  mapsWon: 2,
  mapsLost: 1,
  mvpId: "a2",
  lanternaId: "b2",
  ...over,
});

describe("scoreOptions", () => {
  it("lista os placares com vencedor para cada quantidade de mapas", () => {
    assert.deepEqual(scoreOptions(3), [
      { won: 3, lost: 0 },
      { won: 2, lost: 1 },
    ]);
    assert.deepEqual(scoreOptions(1), [{ won: 1, lost: 0 }]);
    assert.deepEqual(scoreOptions(2), [{ won: 2, lost: 0 }]);
    assert.equal(scoreOptions(5).length, 3);
  });
});

describe("outcomeOf", () => {
  it("vencedor pelos mapas, pelo time em que o capitão jogou", () => {
    const o = outcomeOf({
      maps: [
        { scoreA: 13, scoreB: 11 },
        { scoreA: 9, scoreB: 13 },
        { scoreA: 13, scoreB: 5 },
      ],
      teamOf,
      captains: ["capA", "capB"],
      mvpId: "a2",
      lanternaId: "b2",
    });
    assert.deepEqual(o, { winnerCaptain: "capA", mapsWon: 2, mapsLost: 1, mvpId: "a2", lanternaId: "b2" });
  });

  it("segue o capitão mesmo se os times trocaram de letra na finalização", () => {
    const o = outcomeOf({
      maps: [{ scoreA: 13, scoreB: 2 }],
      teamOf: (id) => (id === "capB" ? "A" : id === "capA" ? "B" : null),
      captains: ["capA", "capB"],
      mvpId: null,
      lanternaId: null,
    });
    assert.equal(o.winnerCaptain, "capB");
  });

  it("empate e mapa sem placar: sem vencedor", () => {
    const o = outcomeOf({
      maps: [
        { scoreA: 13, scoreB: 11 },
        { scoreA: 11, scoreB: 13 },
        { scoreA: null, scoreB: null },
      ],
      teamOf,
      captains: ["capA", "capB"],
      mvpId: null,
      lanternaId: null,
    });
    assert.equal(o.winnerCaptain, null);
  });
});

describe("scorePrediction", () => {
  const outcome = { winnerCaptain: "capA", mapsWon: 2, mapsLost: 1, mvpId: "a2", lanternaId: "b2" };

  it("acerto total vale o máximo", () => {
    assert.equal(scorePrediction(bet(), outcome).points, BOLAO_MAX);
  });

  it("placar certo com vencedor errado não pontua o placar", () => {
    const s = scorePrediction(bet({ winnerCaptain: "capB", mvpId: null, lanternaId: null }), outcome);
    assert.deepEqual(s, { points: 0, winner: false, score: false, mvp: false, lanterna: false });
  });

  it("só o vencedor: 3 pontos", () => {
    const s = scorePrediction(bet({ mapsWon: 3, mapsLost: 0, mvpId: "capB", lanternaId: null }), outcome);
    assert.equal(s.points, 3);
  });

  it("MVP e lanterna valem mesmo errando o vencedor", () => {
    const s = scorePrediction(bet({ winnerCaptain: "capB" }), outcome);
    assert.equal(s.points, 5);
  });

  it("mix empatado: ninguém acerta o vencedor", () => {
    const s = scorePrediction(bet(), { ...outcome, winnerCaptain: null });
    assert.equal(s.winner, false);
    assert.equal(s.score, false);
  });
});

describe("bolaoRanking", () => {
  it("ordena por pontos, placares exatos, MVPs e menos palpites", () => {
    const outcome = { winnerCaptain: "capA", mapsWon: 2, mapsLost: 1, mvpId: "a2", lanternaId: "b2" };
    const rows = bolaoRanking([
      { userId: "x", score: scorePrediction(bet({ userId: "x", mvpId: null, lanternaId: null }), outcome) },
      { userId: "y", score: scorePrediction(bet({ userId: "y", mapsWon: 3, mapsLost: 0 }), outcome) },
      { userId: "z", score: scorePrediction(bet({ userId: "z" }), outcome) },
      { userId: "x", score: scorePrediction(bet({ userId: "x", winnerCaptain: "capB", mvpId: null }), outcome) },
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
