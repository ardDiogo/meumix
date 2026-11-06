/** Testes do cadastro de campeonatos: `npm run test:campeonato`. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canManageChampionship,
  championshipSlug,
  DEFAULT_INPUT,
  prizeDistribution,
  validateChampionship,
} from "./championship";

describe("championshipSlug", () => {
  it("tira acentos e símbolos", () => {
    assert.equal(championshipSlug("Copa MeuMix", "1ª edição"), "copa-meumix-1a-edicao");
    assert.equal(championshipSlug("  !!! "), "campeonato");
  });
});

describe("validateChampionship", () => {
  const ok = { ...DEFAULT_INPUT, name: "Copa MeuMix" };
  it("o padrão do 1º campeonato é válido", () => assert.deepEqual(validateChampionship(ok), []));
  it("potes = jogadores por equipe − 1 (o capitão não sai de pote)", () => {
    assert.match(validateChampionship({ ...ok, potCount: 5 }).join(), /são 4 potes/);
    assert.deepEqual(validateChampionship({ ...ok, playersPerTeam: 6, potCount: 5 }), []);
  });
  it("playoffs precisam de times suficientes", () =>
    assert.match(validateChampionship({ ...ok, playoffFormat: "quarters_semis_final" }).join(), /8 equipes/));
  it("premiação soma 100%", () =>
    assert.match(validateChampionship({ ...ok, prizeSplit: [60, 30, 15] }).join(), /somar 100%/));
  it("datas, dias e horário", () => {
    const e = validateChampionship({
      ...ok,
      startsOn: "2026-12-10",
      endsOn: "2026-12-01",
      matchDays: [],
      windowStart: "25:00",
    }).join();
    assert.match(e, /antes do início/);
    assert.match(e, /ao menos um dia/);
    assert.match(e, /Horário inválido/);
  });
  it("janela pode passar da meia-noite", () =>
    assert.deepEqual(validateChampionship({ ...ok, windowStart: "22:00", windowEnd: "00:30" }), []));
});

describe("prizeDistribution", () => {
  it("25 inscritos a R$ 50 com 60/25/15", () =>
    assert.deepEqual(prizeDistribution(50, 25, [60, 25, 15]), {
      collected: 1250,
      pool: 1250,
      prizes: [750, 312.5, 187.5],
    }));
  it("desconta custos e a sobra de centavos vai para o 1º", () => {
    const r = prizeDistribution(50, 7, [60, 25, 15], 0.01);
    assert.equal(r.pool, 349.99);
    assert.equal(r.prizes.reduce((s, p) => s + p, 0).toFixed(2), "349.99");
  });
  it("sem inscritos, nada a distribuir", () => assert.deepEqual(prizeDistribution(50, 0, [100]).prizes, [0]));
});

describe("canManageChampionship", () => {
  const ch = { createdBy: "a" };
  it("criador, organizador liberado e super admin", () => {
    assert.ok(canManageChampionship({ id: "a", isSuperAdmin: false }, ch, []));
    assert.ok(canManageChampionship({ id: "b", isSuperAdmin: false }, ch, ["b"]));
    assert.ok(canManageChampionship({ id: "z", isSuperAdmin: true }, ch, []));
  });
  it("outro admin ou jogador, não", () => {
    assert.ok(!canManageChampionship({ id: "c", isSuperAdmin: false }, ch, ["b"]));
    assert.ok(!canManageChampionship(null, ch, []));
  });
});
