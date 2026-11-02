/** Testes da importação pela página da GC: `npm run test:gc`. Dados fictícios, no formato da GC. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findMapName, nicksFromHighlights, parseGcPayload, storeGcMap, toOcrMap } from "./gc-api";
import { aggregateGc, roundStory } from "./gc-analysis";
import { mergeMaps } from "./gc-ocr";

const line = (kills: number, deaths: number, extra: Record<string, unknown> = {}) => ({
  kills,
  assists: 3,
  deaths,
  adr: 80.456,
  kdr: kills / deaths,
  kast: 70,
  survived: 0,
  flashAssists: 1,
  multiKills: 2,
  firstKills: 4,
  roundsWithKills: [5, 2, 1, 0, 0],
  headshots: 6,
  headshotRate: 40,
  defuses: 0,
  plants: 1,
  roundsPlayed: 30,
  ...extra,
});
const row = (team: "A" | "B", rating: number) => ({
  team,
  row: {
    general: { rating, roundSwing: 0.0123456 },
    entries: { duels: 5, won: 3, lost: 2, successRate: 60, perRound: 0.1 },
    trades: { made: 4, tradedDeaths: 2, tradedRate: 10, avgTime: 1.876 },
    clutch: {
      situations: 3,
      won: 1,
      rate: 33,
      oneVsOneWon: 1,
      oneVsOneTotal: 1,
      oneVsManyWon: 0,
      oneVsManyTotal: 2,
      biggestComeback: 1,
    },
    utility: { damage: 50, flashAssists: 1, enemiesFlashed: 9, grenades: 30, damagePerGrenade: 1.6 },
    aim: { accuracy: 20.12, headshotRate: 40, headAccuracy: 15.55, killsPerRound: 0.7, mainWeapon: "AK-47" },
  },
});

const stats = {
  status: "pronto",
  subscriber: false,
  scoreboard: { "111": line(25, 15), "222": line(10, 20), "333": line(20, 18), "444": line(12, 22) },
  players: { "111": row("A", 1.31), "222": row("A", 0.8), "333": row("B", 1.1), "444": row("B", 0.7) },
  rounds: [
    { round: 1, winnerTeam: "A", endReason: "bomb_defused", teamASide: "CT", scoreA: 1, scoreB: 0 },
    { round: 2, winnerTeam: "B", endReason: "elimination", teamASide: "CT", scoreA: 1, scoreB: 1 },
    { round: 3, winnerTeam: "B", endReason: "elimination", teamASide: "T", scoreA: 13, scoreB: 11 },
  ],
};
const highlights = {
  pending: false,
  highlights: [
    {
      id: "1",
      type: "epic",
      status: "processed",
      clipTitle: "Inferno AK Ace",
      clipUrl: "https://allstar.gg/iframe?clip=abc123def456&known=false",
      player: { id: "111", nick: "Fulano" },
    },
    {
      id: "2",
      type: "highlight",
      status: "pending",
      clipUrl: null,
      clipTitle: null,
      player: { id: "222", nick: "Ciclano" },
    },
    {
      id: "3",
      type: "highlight",
      status: "pending",
      clipUrl: null,
      clipTitle: null,
      player: { id: "333", nick: "Beltrano" },
    },
  ],
};

// Resultado da partida (/lobby/match/{id}/1): RP, nick e SteamID.
const result = {
  jogos: {
    map_name: "de_mirage",
    players: {
      team_a: [
        {
          idplayer: "111",
          rating_points: "19",
          player: { id: "111", nick: "Fulano Real", plSteamID64: "76561198000000001" },
        },
        { idplayer: "222", rating_points: "-36", player: { id: "222", nick: "Ciclano", plSteamID64: "123" } },
      ],
      team_b: [{ idplayer: "333", rating_points: "0", player: { id: "333", nick: "Beltrano" } }],
    },
  },
};

describe("parseGcPayload", () => {
  it("lê o que o botão manda: jogadores, times, nicks, placar, rounds e clipe", () => {
    const r = parseGcPayload({ v: 1, id: "999", stats, highlights, pageMaps: ["Mirage", "Nuke"] });
    assert.ok(r.ok);
    const m = r.map;
    assert.equal(m.gcMatchId, "999");
    assert.equal(m.scoreA, 13);
    assert.equal(m.scoreB, 11);
    assert.equal(m.rounds.length, 3);
    assert.deepEqual(m.rounds[2], { winner: "B", reason: "elimination", aSide: "T" });
    // Mapa pelo título do clipe (a página citava dois mapas: não serve de pista).
    assert.equal(m.mapHint, "Inferno");
    const p = m.players.find((x) => x.gcId === "111")!;
    assert.equal(p.nick, "Fulano");
    assert.equal(p.team, "A");
    assert.equal(p.adr, 80.46);
    assert.equal(p.rating, 1.31);
    assert.deepEqual(p.entries, { duels: 5, won: 3, lost: 2 });
    assert.equal(p.clutch.biggest, 1);
    assert.equal(p.aim.mainWeapon, "AK-47");
    // Sem destaque, o nick fica pelo ID.
    assert.equal(m.players.find((x) => x.gcId === "444")!.nick, "GC 444");
    assert.deepEqual(m.clips, [{ gcId: "111", clipId: "abc123def456", title: "Inferno AK Ace" }]);
  });

  it("com o resultado: RP, mapa, nick e SteamID (inválido fica de fora)", () => {
    const r = parseGcPayload({ v: 1, id: "999", stats, highlights, result });
    assert.ok(r.ok);
    const by = (id: string) => r.map.players.find((x) => x.gcId === id)!;
    assert.equal(r.map.mapHint, "de_mirage");
    assert.equal(by("111").rp, 19);
    assert.equal(by("111").nick, "Fulano Real");
    assert.equal(by("111").steamId, "76561198000000001");
    assert.equal(by("222").rp, -36);
    assert.equal(by("222").steamId, null);
    assert.equal(by("333").rp, 0);
    // Sem linha no resultado: RP desconhecido (o admin preenche).
    assert.equal(by("444").rp, null);
  });

  it("aceita o JSON da stats colado direto", () => {
    const r = parseGcPayload(stats);
    assert.ok(r.ok);
    assert.equal(r.map.players.length, 4);
    assert.equal(r.map.gcMatchId, "");
  });

  it("recusa estatística em processamento e JSON que não é da GC", () => {
    const busy = parseGcPayload({ ...stats, status: "processando" });
    assert.ok(!busy.ok && /processando/.test(busy.message));
    assert.ok(!parseGcPayload({ foo: 1 }).ok);
  });

  it("usa o único mapa citado na página quando não há clipe", () => {
    const r = parseGcPayload({ v: 1, id: "1", stats, highlights: null, pageMaps: ["Dust 2"] });
    assert.ok(r.ok);
    assert.equal(r.map.mapHint, "Dust2");
  });
});

describe("conversões", () => {
  const map = (parseGcPayload({ v: 1, id: "999", stats, highlights, result }) as { ok: true; map: never }).map;

  it("vira um mapa no formato dos prints e soma como sempre", () => {
    const merged = mergeMaps([toOcrMap(map, "Inferno")]);
    // Nome do resultado da partida vale mais que o do destaque.
    assert.ok(merged.players.some((p) => p.name === "Fulano Real"));
    assert.equal(merged.players.length, 4);
    assert.deepEqual(merged.maps[0], { mapName: "Inferno", scoreX: 13, scoreY: 11 });
    const f = merged.players.find((p) => p.name === "Fulano Real")!;
    assert.equal(f.k, 25);
    assert.equal(merged.players.find((p) => p.name === "Ciclano")!.rp, -36);
  });

  it("salva no lado do mix: inverte times, placar e rounds quando o A da GC é o B do mix", () => {
    const s = storeGcMap(map, "de_inferno", true, (id) => (id === "111" ? "user-1" : null));
    assert.equal(s.scoreA, 11);
    assert.equal(s.scoreB, 13);
    assert.deepEqual(s.rounds[0], { w: "B", r: "bomb_defused", ct: "B" });
    const p = s.players.find((x) => x.gcId === "111")!;
    assert.equal(p.team, "B");
    assert.equal(p.userId, "user-1");
    assert.equal(p.rp, 19);
    assert.ok(!("steamId" in p), "SteamID não fica salvo");
    assert.equal(s.players.find((x) => x.gcId === "333")!.userId, null);
  });

  it("acha nomes de mapa e nicks", () => {
    assert.equal(findMapName("Mirage AWP Ace in Overtime"), "Mirage");
    assert.equal(findMapName("nada aqui"), null);
    assert.deepEqual(nicksFromHighlights(highlights), { "111": "Fulano", "222": "Ciclano", "333": "Beltrano" });
  });
});

describe("análise (gc-analysis)", () => {
  const base = (parseGcPayload({ v: 1, id: "999", stats, highlights, result }) as { ok: true; map: never }).map;
  const m1 = storeGcMap(base, "de_inferno", false, (id) => (id === "111" ? "user-1" : null));
  // Segundo mapa, mais curto: 10 rounds, rating 2,0 para o "111".
  const m2 = {
    ...m1,
    rounds: m1.rounds
      .slice(0, 1)
      .concat(Array.from({ length: 9 }, () => ({ w: "A" as const, r: "elimination", ct: "A" as const }))),
    players: m1.players.map((p) =>
      p.gcId === "111" ? { ...p, rating: 2, k: 10, hs: 10, clutch: { ...p.clutch, biggest: 3 } } : p,
    ),
  };

  it("soma os mapas: contagens somadas, rating pela quantidade de rounds", () => {
    const line = aggregateGc([m1, m2]).find((l) => l.key === "user-1")!;
    assert.equal(line.maps, 2);
    assert.equal(line.k, 35);
    assert.equal(line.hs, 16);
    // 3 rounds com 1,31 e 10 rounds com 2,0.
    assert.equal(Math.round(line.rating! * 1000), Math.round(((1.31 * 3 + 2 * 10) / 13) * 1000));
    assert.equal(line.clutch.biggest, 3);
    assert.equal(line.entries.duels, 10);
    // Convidado fica pelo ID da GC.
    assert.ok(aggregateGc([m1]).some((l) => l.key === "gc:333"));
  });

  it("conta a virada e a maior sequência", () => {
    const rounds = [
      ...Array.from({ length: 10 }, () => ({ w: "A" as const, r: "elimination", ct: "A" as const })),
      ...Array.from({ length: 13 }, () => ({ w: "B" as const, r: "elimination", ct: "B" as const })),
    ];
    const story = roundStory({ ...m1, rounds });
    assert.equal(story.winner, "B");
    assert.deepEqual(story.comeback, { from: { a: 10, b: 0 }, deficit: 10 });
    assert.deepEqual(story.streak, { team: "B", length: 13, from: 11 });
    // Sem virada de verdade (menos de 3 rounds de desvantagem): nada.
    assert.equal(roundStory(m1).comeback, null);
  });
});
