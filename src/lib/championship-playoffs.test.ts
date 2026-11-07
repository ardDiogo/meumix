/** Testes dos playoffs: `npm run test:campeonato`. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { autoStatus, buildBracket, nextSlot, playoffLabel, playoffRounds, roundTitle } from "./championship-playoffs";

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
  it("oitavas (16 times): 1×16, 8×9… e 15 jogos até a final", () => {
    const sixteen = Array.from({ length: 16 }, (_, i) => `t${i + 1}`);
    const b = buildBracket("round16_quarters_semis_final", sixteen);
    assert.equal(b.length, 15);
    assert.deepEqual(b[0]!.seeds, [1, 16]);
    assert.equal(playoffRounds("round16_quarters_semis_final"), 4);
    assert.equal(playoffLabel("round16_quarters_semis_final", 1, 8), "Oitavas de final 8");
    assert.deepEqual(nextSlot("round16_quarters_semis_final", 1, 8), { round: 2, leg: 4, side: "away" });
  });
  it("times insuficientes", () => assert.throws(() => buildBracket("semis_final", ["a", "b", "c"])));
});

describe("status automático do campeonato", () => {
  const sf = (winner: string | null) => ({
    stage: "playoff" as const,
    round: 1,
    status: winner ? "finished" : "pending",
    winnerTeam: winner,
  });
  const final = (winner: string | null) => ({
    stage: "playoff" as const,
    round: 2,
    status: winner ? "finished" : "pending",
    winnerTeam: winner,
  });
  it("final com vencedor finaliza; desfeita volta para Playoffs", () => {
    assert.equal(autoStatus("playoffs", "semis_final", [sf("a"), sf("b"), final("a")]), "finished");
    assert.equal(autoStatus("finished", "semis_final", [sf("a"), sf("b"), final("a")]), null);
    assert.equal(autoStatus("finished", "semis_final", [sf("a"), sf("b"), final(null)]), "playoffs");
    assert.equal(autoStatus("playoffs", "semis_final", [sf("a"), sf(null), final(null)]), null);
  });
  it("sem playoffs: finaliza quando a classificatória termina", () => {
    const g = (status: string) => ({
      stage: "group" as const,
      round: 1,
      status,
      winnerTeam: status === "finished" ? "a" : null,
    });
    assert.equal(autoStatus("running", "none", [g("finished"), g("cancelled")]), "finished");
    assert.equal(autoStatus("running", "none", [g("finished"), g("scheduled")]), null);
    assert.equal(autoStatus("finished", "none", [g("finished"), g("live")]), "running");
  });
  it("cancelado não muda", () => assert.equal(autoStatus("cancelled", "semis_final", [final("a")]), null));
});
