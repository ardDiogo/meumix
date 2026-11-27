import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mixRp, rpPerformance, rpResult, winChance } from "./rp";
import { mvpScore } from "./match-rules";

describe("RP do MeuMix", () => {
  it("times parelhos: +20 / −20 no resultado", () => {
    assert.equal(rpResult(1, 800, 800), 20);
    assert.equal(rpResult(0, 800, 800), -20);
    assert.equal(rpResult(0.5, 800, 800), 0);
  });
  it("ganhar de time mais forte vale mais", () => {
    assert.ok(rpResult(1, 700, 900) > 30);
    assert.ok(rpResult(1, 900, 700) < 10);
    assert.ok(winChance(900, 700) > 0.7);
  });
  it("desempenho limitado a ±20", () => {
    assert.equal(rpPerformance(300, 90), 20);
    assert.equal(rpPerformance(-50, 90), -20);
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
    assert.deepEqual(rp, [40, 19, 19, 19, 19, -21, -21, -21, -21, -40]);
  });
});

describe("PTS (migração 0063)", () => {
  const base = { assists: 0, adr: 0 };
  it("morte sem troca −2,5, trocada −0,5 e sem dados de trade −2", () => {
    assert.equal(mvpScore({ ...base, kills: 1, firstKills: 1, deaths: 1, tradedDeaths: 0 }), 2.5);
    assert.equal(mvpScore({ ...base, kills: 1, firstKills: 1, deaths: 1, tradedDeaths: 1 }), 4.5);
    assert.equal(mvpScore({ ...base, kills: 1, firstKills: 1, deaths: 1, tradedDeaths: null }), 3);
  });
  it("o CT que vira o 1x2 (1 kill + defuse) vale mais que o rusher que pega a FK e morre", () => {
    const rusher = mvpScore({ ...base, kills: 1, firstKills: 1, deaths: 1, tradedDeaths: 0 });
    const clutch = mvpScore({ ...base, kills: 1, firstKills: 0, deaths: 0, tradedDeaths: 0, clutchNv: 1 });
    assert.equal(clutch, 8);
    assert.ok(clutch > rusher);
  });
  it("Swing: 5 por round ganho (ou perdido) para o time", () => {
    assert.equal(mvpScore({ ...base, kills: 0, firstKills: 0, deaths: 0, tradedDeaths: 0, swingRounds: 2 }), 10);
    assert.equal(mvpScore({ ...base, kills: 0, firstKills: 0, deaths: 0, tradedDeaths: 0, swingRounds: -1 }), -5);
  });
});
