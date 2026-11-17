import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isLateLeave, LATE_LEAVE_MS, queueOrder } from "./strikes";

const H = 60 * 60 * 1000;

describe("saída tardia", () => {
  const eventAt = Date.UTC(2026, 10, 17, 23, 0);
  it("classificado a menos de 3h conta falta", () => {
    assert.equal(isLateLeave(true, eventAt, eventAt - 1 * H), true);
    assert.equal(isLateLeave(true, eventAt, eventAt - LATE_LEAVE_MS), true);
  });
  it("com mais de 3h, reserva ou depois do início não conta", () => {
    assert.equal(isLateLeave(true, eventAt, eventAt - 3 * H - 1000), false);
    assert.equal(isLateLeave(false, eventAt, eventAt - 1 * H), false);
    assert.equal(isLateLeave(true, eventAt, eventAt), false);
  });
});

describe("ordem da lista", () => {
  it("suspensos vão para o fim, mantendo a ordem de chegada", () => {
    const rows = [
      { id: "a", reserve_only: false },
      { id: "s1", reserve_only: true },
      { id: "b" },
      { id: "s2", reserve_only: true },
      { id: "c", reserve_only: null },
    ];
    assert.deepEqual(
      queueOrder(rows).map((r) => r.id),
      ["a", "b", "c", "s1", "s2"],
    );
  });
});
