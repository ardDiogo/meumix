/** Testes das estatísticas e da colocação final: `npm run test:campeonato`. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { prizeDistribution } from "./championship";
import { bestByMap, BOARDS, finalPlacing, leaders, minMapsFor, mvpOf } from "./championship-stats";
import { aggregateGc } from "./gc-analysis";
import type { GcMapStored } from "./gc-api";

type P = GcMapStored["players"][number];
const pl = (userId: string, team: "A" | "B", rating: number, k = 20, d = 15, hs = 8): P => ({
  gcId: userId,
  nick: userId,
  team,
  userId,
  rp: 0,
  k,
  a: 3,
  d,
  adr: 80,
  kast: 70,
  fk: 1,
  mk: 1,
  fa: 0,
  hs,
  hsRate: (hs / k) * 100,
  plants: 0,
  defuses: 0,
  multi: [5, 2, 1, 0, 0],
  rating,
  swing: 0,
  entries: { duels: 2, won: 1, lost: 1 },
  trades: { made: 1, traded: 1, avgTime: 2 },
  clutch: { situations: 1, won: 0, v1Won: 0, v1Total: 0, vnWon: 0, vnTotal: 1, biggest: null },
  utility: { damage: 10, flashed: 2, grenades: 5 },
  aim: { accuracy: 20, headAccuracy: 10, mainWeapon: "AK-47" },
});
const map = (mapId: string, players: P[]): GcMapStored => ({
  gcMatchId: "1",
  mapId,
  scoreA: 13,
  scoreB: 7,
  rounds: Array.from({ length: 20 }, (_, i) => ({ w: i < 13 ? "A" : "B", r: "elimination", ct: "A" })),
  players,
  clips: [],
});

describe("estatísticas do campeonato", () => {
  const maps = [
    map("de_mirage", [pl("ana", "A", 1.4, 30, 10, 20), pl("bia", "B", 0.9)]),
    map("de_nuke", [pl("ana", "A", 1.2), pl("bia", "B", 1.3), pl("cris", "A", 2.5, 40, 5)]),
  ];
  const lines = aggregateGc(maps);
  it("médias exigem metade dos mapas; totais não", () => {
    assert.equal(minMapsFor(lines), 1);
    const rating = leaders(lines, BOARDS[0]!);
    assert.equal(rating[0]!.line.userId, "cris");
    const kills = leaders(
      lines,
      BOARDS.find((b) => b.key === "kills")!,
    );
    assert.equal(kills[0]!.line.userId, "ana", "30 + 20 kills");
  });
  it("com mais mapas, quem jogou pouco sai das médias", () => {
    const more = aggregateGc([
      ...maps,
      map("de_inferno", [pl("ana", "A", 1.1), pl("bia", "B", 1)]),
      map("de_inferno", [pl("ana", "A", 1), pl("bia", "B", 1)]),
    ]);
    assert.equal(minMapsFor(more), 2);
    assert.equal(mvpOf(more)!.userId !== "cris", true);
  });
  it("melhor jogador por mapa", () => {
    const best = bestByMap(maps);
    assert.deepEqual(
      best.map((b) => [b.mapId, b.best!.userId]),
      [
        ["de_mirage", "ana"],
        ["de_nuke", "cris"],
      ],
    );
  });
});

describe("colocação final e premiação", () => {
  const group = ["Snkk", "Mald", "Beli", "Marlon", "Koder"];
  const sf = (home: string, away: string, winner: string | null) => ({
    stage: "playoff" as const,
    round: 1,
    homeTeam: home,
    awayTeam: away,
    winnerTeam: winner,
  });
  it("campeão, vice, 3º = semifinalista melhor classificado", () => {
    const matches = [
      sf("Snkk", "Marlon", "Marlon"),
      sf("Mald", "Beli", "Mald"),
      { stage: "playoff" as const, round: 2, homeTeam: "Marlon", awayTeam: "Mald", winnerTeam: "Marlon" },
    ];
    assert.deepEqual(finalPlacing("semis_final", group, matches), ["Marlon", "Mald", "Snkk", "Beli", "Koder"]);
  });
  it("final em aberto: 1º e 2º indefinidos", () => {
    const matches = [
      sf("Snkk", "Marlon", "Snkk"),
      sf("Mald", "Beli", "Beli"),
      { stage: "playoff" as const, round: 2, homeTeam: "Snkk", awayTeam: "Beli", winnerTeam: null },
    ];
    assert.deepEqual(finalPlacing("semis_final", group, matches).slice(0, 4), [null, null, "Mald", "Marlon"]);
  });
  it("valores com 25 pagantes", () => {
    const p = prizeDistribution(50, 25, [60, 25, 15]);
    assert.deepEqual(p.prizes, [750, 312.5, 187.5]);
  });
});
