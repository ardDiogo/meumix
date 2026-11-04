/** Testes da análise da partida: `npm run test:analise`. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { GcMapStored } from "./gc-api";
import { joinFacts, matchAnalysis } from "./match-analysis";

type P = GcMapStored["players"][number];
const player = (userId: string, team: "A" | "B", extra: Partial<P> = {}): P => ({
  gcId: userId,
  nick: userId,
  team,
  userId,
  rp: 0,
  k: 20,
  a: 4,
  d: 18,
  adr: 80,
  kast: 70,
  fk: 2,
  mk: 3,
  fa: 1,
  hs: 8,
  hsRate: 40,
  plants: 0,
  defuses: 0,
  multi: [8, 3, 1, 0, 0],
  rating: 1,
  swing: 0,
  entries: { duels: 6, won: 3, lost: 3 },
  trades: { made: 5, traded: 3, avgTime: 2 },
  clutch: { situations: 2, won: 0, v1Won: 0, v1Total: 0, vnWon: 0, vnTotal: 2, biggest: null },
  utility: { damage: 50, flashed: 12, grenades: 30 },
  aim: { accuracy: 20, headAccuracy: 15, mainWeapon: "AK-47" },
  ...extra,
});
const map = (mapId: string, players: P[]): GcMapStored => ({
  gcMatchId: "1",
  mapId,
  scoreA: 13,
  scoreB: 9,
  rounds: Array.from({ length: 22 }, (_, i) => ({ w: i < 13 ? "A" : "B", r: "elimination", ct: "A" })),
  players,
  clips: [],
});
const names = (id: string) => id.replace("de_", "").replace(/^\w/, (c) => c.toUpperCase());

describe("matchAnalysis", () => {
  const m1 = map("de_inferno", [
    player("trem", "A", {
      rating: 1.3,
      entries: { duels: 7, won: 2, lost: 5 },
      clutch: { situations: 3, won: 2, v1Won: 1, v1Total: 1, vnWon: 1, vnTotal: 2, biggest: 2 },
    }),
    player("kajura", "A", {
      rating: 0.77,
      entries: { duels: 11, won: 6, lost: 5 },
      trades: { made: 4, traded: 8, avgTime: 2 },
    }),
    player("paiked", "A", { kast: 86, utility: { damage: 30, flashed: 40, grenades: 50 } }),
    player("barker", "B", { rating: 1.2 }),
  ]);
  const m2 = map("de_ancient", [
    player("trem", "A", { rating: 1.26, entries: { duels: 6, won: 2, lost: 4 } }),
    player("kajura", "A", {
      rating: 1.53,
      entries: { duels: 10, won: 6, lost: 4 },
      trades: { made: 4, traded: 7, avgTime: 2 },
    }),
    player("paiked", "A", { kast: 86, utility: { damage: 30, flashed: 26, grenades: 50 } }),
    player("barker", "B", {
      rating: 1.1,
      aim: { accuracy: 20, headAccuracy: 15, mainWeapon: "AWP" },
      entries: { duels: 6, won: 1, lost: 5 },
    }),
  ]);
  const teams = matchAnalysis([m1, m2], { winner: "A", mapName: names, names: { trem: "As vezes sei la" } });

  it("vencedor primeiro, do melhor rating para o pior", () => {
    assert.deepEqual(
      teams.map((t) => [t.side, t.won]),
      [
        ["A", true],
        ["B", false],
      ],
    );
    assert.equal(teams[0]!.players[0]!.name, "As vezes sei la");
  });

  it("fatos com os números certos e dica por regra", () => {
    const [trem, kajura, paiked] = teams[0]!.players;
    const t = joinFacts(trem!.facts);
    assert.match(t, /^Melhor rating da série \(1,28\)/);
    assert.match(t, /venceu só 4 de 13 duelos de abertura, o pior aproveitamento do time/);
    assert.match(t, /2 de 5 clutches \(um 1v2\)/);
    assert.match(trem!.tip!, /primeira entrada para o kajura/);
    const k = joinFacts(kajura!.facts);
    assert.match(k, /rating foi de 0,77 no Inferno para 1,53 no Ancient/);
    assert.match(k, /foi quem mais abriu round: 21 duelos de abertura, 12 vencidos/);
    assert.match(k, /15 das mortes dele foram trocadas/);
    assert.equal(kajura!.tip, "Quando a troca sai, o papel de entry funciona.");
    assert.match(joinFacts(paiked!.facts), /66 inimigos cegados, o maior número da série.*KAST de 86%/);
    const barker = teams[1]!.players[0]!;
    assert.match(joinFacts(barker.facts), /jogou de AWP no Ancient/);
    assert.equal(barker.tip, "Para quem segura a AWP, abrir o round é o trabalho principal.");
  });

  it("sem dados da GC, nada", () => {
    assert.deepEqual(matchAnalysis([], { winner: null, mapName: names }), []);
  });
});
