import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { lockedMaps } from "./map-tiebreak";

const t = (...v: number[]) => v.map((votes, i) => ({ id: `m${i}`, votes }));

describe("mapas garantidos com votos faltando", () => {
  it("mix de hoje: 2 garantidos, 4 empatados e votos faltando → espera", () => {
    // Inferno 5, Cache 4, quatro com 3 (ex.), 6 votaram, faltam 4.
    const r = lockedMaps(t(5, 4, 3, 3, 3, 3, 0), 4, 4);
    assert.equal(r.decided, false);
  });
  it("vantagem grande: os votos que faltam não mudam o top 4", () => {
    const r = lockedMaps(t(9, 9, 8, 8, 1, 0, 0), 4, 1);
    assert.equal(r.decided, true);
    assert.deepEqual(r.locked, ["m0", "m1", "m2", "m3"]);
  });
  it("um voto faltando ainda pode empatar → espera", () => {
    const r = lockedMaps(t(9, 9, 8, 7, 6, 0, 0), 4, 1);
    assert.equal(r.decided, false);
    assert.deepEqual(r.locked, ["m0", "m1", "m2"]);
  });
  it("todos votaram: vale o empate normal", () => {
    assert.equal(lockedMaps(t(5, 4, 3, 3, 3, 3, 0), 4, 0).decided, false);
    assert.equal(lockedMaps(t(5, 4, 3, 2, 1, 0, 0), 4, 0).decided, true);
  });
});

import { captainMaps } from "./map-tiebreak";

describe("desempate entre os capitães", () => {
  const c = ["ancient", "anubis", "dust2", "nuke"];
  it("escolhas iguais: entram direto, sem PPT", () => {
    assert.deepEqual(captainMaps(c, 2, ["ancient", "nuke"], ["nuke", "ancient"], null), {
      winners: ["ancient", "nuke"],
    });
  });
  it("discordância espera o PPT e fica com a escolha do perdedor", () => {
    assert.deepEqual(captainMaps(c, 2, ["ancient", "nuke"], ["ancient", "dust2"], null), { waiting: "ppt" });
    assert.deepEqual(captainMaps(c, 2, ["ancient", "nuke"], ["ancient", "dust2"], "b"), {
      winners: ["ancient", "dust2"],
    });
    assert.deepEqual(captainMaps(c, 1, ["anubis"], ["dust2"], "a"), { winners: ["anubis"] });
  });
  it("3 empatados para 2 vagas: sempre 1 em comum, a outra vaga é do perdedor", () => {
    const three = ["ancient", "dust2", "nuke"];
    assert.deepEqual(captainMaps(three, 2, ["ancient", "dust2"], ["dust2", "nuke"], "a"), {
      winners: ["dust2", "ancient"],
    });
  });
  it("sem o voto dos dois, espera", () => {
    assert.deepEqual(captainMaps(c, 2, ["ancient", "nuke"], null, "a"), { waiting: "votes" });
  });
});
