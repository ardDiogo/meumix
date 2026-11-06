/** Testes dos playoffs: `npm run test:campeonato`. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildBracket, nextSlot, playoffLabel, playoffRounds, roundTitle } from "./championship-playoffs";

const RANK = ["Snkk", "Beli", "Koder", "Mald", "Marlon"];

describe("playoffs", () => {
  it("semifinais 1º × 4º e 2º × 3º; final esperando os vencedores", () => {
    assert.deepEqual(buildBracket("semis_final", RANK), [
      { round: 1, leg: 1, home: "Snkk", away: "Mald", seeds: [1, 4] },
      { round: 1, leg: 2, home: "Beli", away: "Koder", seeds: [2, 3] },
      { round: 2, leg: 1, home: null, away: null, seeds: null },
    ]);
  });
  it("vencedor da SF1 é mandante na final; da SF2, visitante", () => {
    assert.deepEqual(nextSlot("semis_final", 1, 1), { round: 2, leg: 1, side: "home" });
    assert.deepEqual(nextSlot("semis_final", 1, 2), { round: 2, leg: 1, side: "away" });
    assert.equal(nextSlot("semis_final", 2, 1), null);
  });
  it("quartas: 1×8, 4×5, 2×7, 3×6 e o caminho até a final", () => {
    const eight = Array.from({ length: 8 }, (_, i) => `t${i + 1}`);
    const b = buildBracket("quarters_semis_final", eight);
    assert.deepEqual(
      b.filter((f) => f.round === 1).map((f) => f.seeds),
      [
        [1, 8],
        [4, 5],
        [2, 7],
        [3, 6],
      ],
    );
    assert.equal(b.length, 7);
    assert.deepEqual(nextSlot("quarters_semis_final", 1, 4), { round: 2, leg: 2, side: "away" });
    assert.deepEqual(nextSlot("quarters_semis_final", 2, 2), { round: 3, leg: 1, side: "away" });
  });
  it("só final: 1º × 2º", () => {
    assert.deepEqual(buildBracket("final", RANK), [{ round: 1, leg: 1, home: "Snkk", away: "Beli", seeds: [1, 2] }]);
    assert.equal(playoffRounds("final"), 1);
  });
  it("nomes", () => {
    assert.equal(playoffLabel("semis_final", 1, 2), "Semifinal 2");
    assert.equal(playoffLabel("semis_final", 2, 1), "Final");
    assert.equal(roundTitle("semis_final", 1), "Semifinais");
    assert.equal(playoffLabel("quarters_semis_final", 1, 3), "Quartas de final 3");
  });
  it("times insuficientes", () => assert.throws(() => buildBracket("semis_final", ["a", "b", "c"])));
});
