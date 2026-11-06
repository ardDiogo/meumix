/** Testes dos confrontos e da agenda: `npm run test:campeonato`. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { byes, freeServer, fromLocal, inWindow, roundRobin, scheduleProblem, toLocal } from "./championship-schedule";

const T = ["Snkk", "Beli", "Koder", "Mald", "Marlon"];
const pair = (a: string, b: string) => [a, b].sort().join("×");

describe("confrontos", () => {
  const f = roundRobin(T);
  it("calendário publicado para 5 times", () => {
    const show = (r: number) => f.filter((x) => x.round === r).map((x) => `${x.home} × ${x.away}`);
    assert.deepEqual(show(1), ["Beli × Marlon", "Koder × Mald"]);
    assert.deepEqual(show(2), ["Snkk × Marlon", "Beli × Koder"]);
    assert.deepEqual(show(3), ["Snkk × Mald", "Marlon × Koder"]);
    assert.deepEqual(show(4), ["Snkk × Koder", "Mald × Beli"]);
    assert.deepEqual(show(5), ["Snkk × Beli", "Mald × Marlon"]);
    assert.deepEqual(byes(f, T), { 1: ["Snkk"], 2: ["Mald"], 3: ["Beli"], 4: ["Marlon"], 5: ["Koder"] });
  });
  const valid = (teams: string[], fx: ReturnType<typeof roundRobin>, games: number) => {
    const n = teams.length;
    assert.equal(fx.length, (n * (n - 1)) / 2);
    assert.equal(new Set(fx.map((x) => pair(x.home, x.away))).size, fx.length, "sem confronto repetido");
    for (const t of teams) assert.equal(fx.filter((x) => x.home === t || x.away === t).length, games);
    for (const r of new Set(fx.map((x) => x.round))) {
      const ts = fx.filter((x) => x.round === r).flatMap((x) => [x.home, x.away]);
      assert.equal(new Set(ts).size, ts.length, `rodada ${r}: time em dois jogos`);
    }
  };
  it("10 confrontos, 4 por time, ninguém em dois jogos na rodada", () => valid(T, f, 4));
  it("método do círculo para outros tamanhos", () => {
    for (const n of [2, 3, 4, 6, 7, 8]) {
      const teams = Array.from({ length: n }, (_, i) => `t${i}`);
      valid(teams, roundRobin(teams), n - 1);
      const b = byes(roundRobin(teams), teams);
      for (const list of Object.values(b)) assert.equal(list.length, n % 2);
    }
  });
  it("ida e volta inverte o mando", () => {
    const d = roundRobin(T, true);
    assert.equal(d.length, 20);
    assert.deepEqual(d[10], { round: 6, home: "Marlon", away: "Beli" });
  });
});

describe("janela de horário", () => {
  // 16/11/2026 é segunda-feira.
  const ok = (local: string) => inWindow(fromLocal(local)!, [1, 2], "21:00", "23:30");
  it("segunda e terça das 21:00 às 23:30", () => {
    assert.ok(ok("2026-11-16T21:00"));
    assert.ok(ok("2026-11-17T23:29"));
    assert.ok(!ok("2026-11-16T23:30"));
    assert.ok(!ok("2026-11-16T20:59"));
    assert.ok(!ok("2026-11-18T21:30"), "quarta não");
  });
  it("janela que passa da meia-noite", () => {
    const w = (local: string) => inWindow(fromLocal(local)!, [1], "22:00", "00:30");
    assert.ok(w("2026-11-16T23:00"));
    assert.ok(w("2026-11-17T00:15"), "madrugada de terça conta como segunda");
    assert.ok(!w("2026-11-17T22:30"));
  });
  it("fuso de Brasília ida e volta", () => {
    assert.equal(fromLocal("2026-11-16T21:30"), "2026-11-17T00:30:00.000Z");
    assert.equal(toLocal("2026-11-17T00:30:00.000Z"), "2026-11-16T21:30");
    assert.equal(fromLocal("16/11 21h"), null);
  });
});

describe("conflitos", () => {
  const at = (id: string, home: string, away: string, local: string, server: number | null = null, bestOf = 1) => ({
    id,
    home,
    away,
    startsAt: fromLocal(local)!,
    bestOf,
    server,
  });
  const names = { A: "A", B: "B", C: "C", D: "D", E: "E", F: "F", G: "G", H: "H" };
  it("time não joga duas partidas ao mesmo tempo", () => {
    assert.match(
      scheduleProblem(at("x", "A", "C", "2026-11-16T21:30"), [at("1", "A", "B", "2026-11-16T21:00")], 3, names)!,
      /A já tem jogo/,
    );
    assert.equal(
      scheduleProblem(at("x", "A", "C", "2026-11-16T22:15"), [at("1", "A", "B", "2026-11-16T21:00")], 3),
      null,
    );
  });
  it("até 3 jogos simultâneos com times diferentes; servidor não repete", () => {
    const others = [at("1", "A", "B", "2026-11-16T21:00", 1), at("2", "C", "D", "2026-11-16T21:00", 2)];
    assert.equal(scheduleProblem(at("x", "E", "F", "2026-11-16T21:00", 3), others, 3), null);
    assert.match(scheduleProblem(at("x", "E", "F", "2026-11-16T21:00", 2), others, 3)!, /servidor 2/);
    assert.equal(freeServer(at("x", "E", "F", "2026-11-16T21:00"), others, 3), 3);
    const full = [...others, at("3", "E", "F", "2026-11-16T21:00", 3)];
    assert.match(scheduleProblem(at("x", "G", "H", "2026-11-16T21:30"), full, 3)!, /limite de 3/);
    assert.equal(freeServer(at("x", "G", "H", "2026-11-16T21:30"), full, 3), null);
  });
  it("MD3 ocupa mais tempo", () => {
    const md3 = [at("1", "A", "B", "2026-11-16T21:00", 1, 3)];
    assert.match(scheduleProblem(at("x", "A", "C", "2026-11-16T23:00"), md3, 3, names)!, /A já tem jogo/);
  });
});
