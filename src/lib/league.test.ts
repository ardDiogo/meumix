import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { leagueCookieValue, leagueDayLabel, leagueToday, pickLeagueSlug } from "./league";

const LEAGUES = [
  { slug: "principal", weekday: 1 },
  { slug: "terca", weekday: 2 },
];
const BOTH = new Set(["principal", "terca"]);
// 2026-11-09 é segunda; 2026-11-10, terça; 2026-11-11, quarta (horário de Brasília = UTC−3).
const at = (iso: string) => new Date(iso);

describe("leagueToday", () => {
  it("usa o fuso de Brasília e vira o dia às 6h", () => {
    assert.deepEqual(leagueToday(at("2026-11-09T15:00:00Z")), { date: "2026-11-09", weekday: 1 });
    // Terça 01:30 em Brasília (mix de segunda passando da meia-noite) ainda é segunda.
    assert.deepEqual(leagueToday(at("2026-11-10T04:30:00Z")), { date: "2026-11-09", weekday: 1 });
    // Terça 06:30 em Brasília já é terça.
    assert.deepEqual(leagueToday(at("2026-11-10T09:30:00Z")), { date: "2026-11-10", weekday: 2 });
  });
});

describe("pickLeagueSlug", () => {
  it("na segunda abre a Lanterna; na terça, o Jantinha", () => {
    assert.equal(pickLeagueSlug(null, LEAGUES, BOTH, at("2026-11-09T15:00:00Z")), "principal");
    assert.equal(pickLeagueSlug(null, LEAGUES, BOTH, at("2026-11-10T15:00:00Z")), "terca");
  });

  it("a escolha feita hoje vale até o fim do dia", () => {
    const monday = at("2026-11-09T15:00:00Z");
    assert.equal(pickLeagueSlug(leagueCookieValue("terca", monday), LEAGUES, BOTH, monday), "terca");
  });

  it("a escolha de outro dia perde para a liga do dia", () => {
    const cookie = leagueCookieValue("principal", at("2026-11-09T15:00:00Z"));
    assert.equal(pickLeagueSlug(cookie, LEAGUES, BOTH, at("2026-11-10T15:00:00Z")), "terca");
    // Cookie antigo (só o slug) também.
    assert.equal(pickLeagueSlug("principal", LEAGUES, BOTH, at("2026-11-10T15:00:00Z")), "terca");
  });

  it("em dia sem mix fica a última escolha; sem escolha, a primeira liga da pessoa", () => {
    const wednesday = at("2026-11-11T15:00:00Z");
    assert.equal(pickLeagueSlug("terca|2026-11-03", LEAGUES, BOTH, wednesday), "terca");
    assert.equal(pickLeagueSlug(null, LEAGUES, new Set(["terca"]), wednesday), "terca");
  });

  it("só considera ligas que a pessoa vê", () => {
    const onlyTerca = [LEAGUES[1]!];
    assert.equal(pickLeagueSlug(null, onlyTerca, new Set(["terca"]), at("2026-11-09T15:00:00Z")), "terca");
    assert.equal(
      pickLeagueSlug("principal|2026-11-09", onlyTerca, new Set(["terca"]), at("2026-11-09T15:00:00Z")),
      "terca",
    );
    assert.equal(pickLeagueSlug(null, [], new Set(), at("2026-11-09T15:00:00Z")), null);
  });
});

describe("leagueDayLabel", () => {
  it("monta o subtítulo", () => {
    assert.equal(leagueDayLabel(1), "Mix de Segunda-feira");
    assert.equal(leagueDayLabel(2), "Mix de Terça-feira");
    assert.equal(leagueDayLabel(null), null);
  });
});
