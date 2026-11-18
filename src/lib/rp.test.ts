import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mixRp, rpPerformance, rpResult, winChance } from "./rp";

describe("RP do MeuMix", () => {
  it("times parelhos: +10 / −10 no resultado", () => {
    assert.equal(rpResult(1, 800, 800), 10);
    assert.equal(rpResult(0, 800, 800), -10);
    assert.equal(rpResult(0.5, 800, 800), 0);
  });
  it("ganhar de time mais forte vale mais", () => {
    assert.ok(rpResult(1, 700, 900) > 15);
    assert.ok(rpResult(1, 900, 700) < 5);
    assert.ok(winChance(900, 700) > 0.7);
  });
  it("desempenho limitado a ±10", () => {
    assert.equal(rpPerformance(300, 90), 10);
    assert.equal(rpPerformance(-50, 90), -10);
    assert.equal(rpPerformance(50, null), 0);
  });
  it("igual ao banco (teste da 0056)", () => {
    const line = (team: "A" | "B", k: number, d: number, score: 1 | 0 | 0.5) => ({
      team,
      kills: k,
      deaths: d,
      assists: 5,
      firstKills: 2,
      adr: 80,
      elo: 285,
      score,
    });
    const players = [
      line("A", 40, 15, 1),
      line("A", 20, 20, 1),
      line("A", 20, 20, 1),
      line("A", 20, 20, 1),
      line("A", 20, 20, 1),
      line("B", 20, 20, 0),
      line("B", 20, 20, 0),
      line("B", 20, 20, 0),
      line("B", 20, 20, 0),
      line("B", 8, 30, 0),
    ];
    const rp = mixRp(players).map((r) => r.rp);
    assert.deepEqual(rp, [20, 10, 10, 10, 10, -10, -10, -10, -10, -20]);
  });
});
