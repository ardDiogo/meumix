/** Testes do draft do campeonato: `npm run test:campeonato`. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { draftProgress, potIssues, resolveAdedonha, snakeOrder, snakeSlot } from "./championship-draft";

const ORDER = ["Snkk", "Beli", "Koder", "Mald", "Marlon"];

describe("serpentina", () => {
  it("inverte a ordem a cada pote (1→5, 5→1, 1→5, 5→1)", () =>
    assert.deepEqual(snakeOrder(ORDER, 4), [
      ["Snkk", "Beli", "Koder", "Mald", "Marlon"],
      ["Marlon", "Mald", "Koder", "Beli", "Snkk"],
      ["Snkk", "Beli", "Koder", "Mald", "Marlon"],
      ["Marlon", "Mald", "Koder", "Beli", "Snkk"],
    ]));
  it("o último de um pote é o primeiro do seguinte", () => {
    assert.equal(snakeSlot(5, ORDER).teamId, "Marlon");
    assert.equal(snakeSlot(6, ORDER).teamId, "Marlon");
    assert.deepEqual(snakeSlot(6, ORDER), { pot: 2, teamId: "Marlon", turnInPot: 1 });
  });
  it("cada time escolhe uma vez por pote (20 escolhas, 4 por time)", () => {
    const all = Array.from({ length: 20 }, (_, i) => snakeSlot(i + 1, ORDER));
    for (const t of ORDER) assert.equal(all.filter((s) => s.teamId === t).length, 4);
    for (let pot = 1; pot <= 4; pot++)
      assert.equal(new Set(all.filter((s) => s.pot === pot).map((s) => s.teamId)).size, 5);
  });
  it("progresso: próxima escolha e fim", () => {
    const picks = Array.from({ length: 7 }, (_, i) => ({ pickNo: i + 1, pot: 1, teamId: "x", userId: `u${i}` }));
    assert.deepEqual(draftProgress(ORDER, 4, picks).next, { pickNo: 8, pot: 2, teamId: "Koder", turnInPot: 3 });
    const full = Array.from({ length: 20 }, (_, i) => ({ pickNo: i + 1, pot: 1, teamId: "x", userId: `u${i}` }));
    assert.equal(draftProgress(ORDER, 4, full).next, null);
  });
});

describe("adedonha", () => {
  const roda = ["A", "B", "C", "D", "E"];
  it("conta a partir de quem começa (conta 1)", () => {
    // total 7 a partir de C: C1 D2 E3 A4 B5 C6 D7
    assert.deepEqual(resolveAdedonha(roda, "C", { A: 2, B: 0, C: 1, D: 3, E: 1 }), { total: 7, picked: "D" });
  });
  it("total 1 fica com quem começa; total 0 volta um", () => {
    assert.equal(resolveAdedonha(roda, "B", { A: 1 }).picked, "B");
    assert.equal(resolveAdedonha(roda, "A", {}).picked, "E");
  });
  it("com 2 times, alterna pelo par/ímpar", () => {
    assert.equal(resolveAdedonha(["A", "B"], "A", { A: 3, B: 2 }).picked, "A");
    assert.equal(resolveAdedonha(["A", "B"], "A", { A: 3, B: 3 }).picked, "B");
  });
});

describe("potes", () => {
  const caps = new Set(["c1", "c2"]);
  it("cada pote com um jogador por time; capitães ficam de fora", () => {
    const players = [
      { userId: "c1", pot: null },
      { userId: "c2", pot: null },
      { userId: "a", pot: 1 },
      { userId: "b", pot: 1 },
      { userId: "c", pot: 2 },
      { userId: "d", pot: null },
    ];
    assert.deepEqual(potIssues(players, caps, 2, 2), ["1 jogador ainda sem pote.", "Pote 2: 1 de 2 jogadores."]);
    players[5]!.pot = 2;
    assert.deepEqual(potIssues(players, caps, 2, 2), []);
  });
});
