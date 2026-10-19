/** Testes do motor de insígnias: `npm run test:badges`. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeBadges, type EngineBadge, type EngineMatch, type EngineRecord } from "./badge-engine";

const FOGUINHO: EngineBadge = { id: "b-fog", rule: "win_streak", params: { n: 3 } };
const PE_FRIO: EngineBadge = { id: "b-pe", rule: "loss_streak", params: { n: 3 } };
const REI: EngineBadge = { id: "b-rei", rule: "ranking_leader", params: { min_mixes: 1 } };
const MVP: EngineBadge = { id: "b-mvp", rule: "latest_mvp" };
const VETERANO: EngineBadge = { id: "b-vet", rule: "veteran", params: { mixes: 2 } };
const CONSISTENTE: EngineBadge = { id: "b-con", rule: "consistent", params: { mixes: 2, min_rating: 0.9 } };
const REI_MAPA: EngineBadge = { id: "b-map", rule: "map_king", params: { min_maps: 2, min_win_rate: 60 } };
const LANTERNA: EngineBadge = { id: "b-lan", rule: "latest_lanterna" };
const LANTERNA_VERMELHA: EngineBadge = { id: "b-lv", rule: "lanterna_streak", params: { n: 3 } };
const FOGUETE: EngineBadge = { id: "b-fgt", rule: "rank_climber", params: { positions: 2, window: 1 } };

let seq = 0;
const rec = (userId: string, team: "A" | "B", extra: Partial<EngineRecord> = {}): EngineRecord => ({
  userId,
  team,
  kills: 20,
  deaths: 15,
  assists: 5,
  adr: 85,
  kast: 75,
  isMvp: false,
  eloAfter: null,
  ...extra,
});
/** Mix com mapas [placarA, placarB] (null = não jogado). ARD no time A, BARKER no B. */
function mix(scores: [number | null, number | null][], extra: { records?: EngineRecord[] } = {}): EngineMatch {
  seq++;
  const day = String(seq).padStart(2, "0");
  return {
    id: `m${seq}`,
    date: `2026-09-${day}`,
    finalizedAt: `2026-09-${day}T23:30:00Z`,
    maps: scores.map(([a, b], i) => ({ mapId: ["de_mirage", "de_inferno", "de_nuke"][i % 3]!, scoreA: a, scoreB: b })),
    records: extra.records ?? [rec("ard", "A"), rec("barker", "B")],
  };
}
const W: [number, number] = [13, 7]; // A vence
const L: [number, number] = [7, 13]; // B vence
const of = (rows: ReturnType<typeof computeBadges>["rows"], badgeId: string, userId: string) =>
  rows.filter((r) => r.badgeId === badgeId && r.userId === userId);
const active = (rows: ReturnType<typeof computeBadges>["rows"], badgeId: string, userId: string) =>
  of(rows, badgeId, userId).filter((r) => r.deactivatedAt == null);

describe("Foguinho (vitórias seguidas em mapas)", () => {
  it("3 vitórias seguidas concedem Foguinho", () => {
    const { rows } = computeBadges({ matches: [mix([W, W]), mix([W])], badges: [FOGUINHO] });
    assert.equal(active(rows, "b-fog", "ard").length, 1);
    assert.equal(of(rows, "b-fog", "barker").length, 0);
  });

  it("2 vitórias não bastam e o progresso mostra 2/3", () => {
    const { rows, progress } = computeBadges({ matches: [mix([W, W])], badges: [FOGUINHO] });
    assert.equal(of(rows, "b-fog", "ard").length, 0);
    assert.deepEqual(
      progress.find((p) => p.userId === "ard" && p.badgeId === "b-fog"),
      {
        userId: "ard",
        badgeId: "b-fog",
        current: 2,
        target: 3,
      },
    );
  });

  it("uma derrota desativa (sem apagar o histórico) e nova sequência conquista de novo", () => {
    const { rows } = computeBadges({ matches: [mix([W, W, W]), mix([L]), mix([W, W, W])], badges: [FOGUINHO] });
    const all = of(rows, "b-fog", "ard");
    assert.equal(all.length, 2, "duas conquistas no histórico");
    assert.ok(all[0]!.deactivatedAt, "a primeira foi encerrada");
    assert.match(all[0]!.endReason!, /derrota/);
    assert.equal(all[1]!.deactivatedAt, null, "a segunda está ativa");
    assert.notEqual(all[0]!.sourceRef, all[1]!.sourceRef);
  });

  it("após a derrota, sem nova sequência, fica só no histórico", () => {
    const { rows } = computeBadges({ matches: [mix([W, W, W]), mix([L])], badges: [FOGUINHO] });
    assert.equal(of(rows, "b-fog", "ard").length, 1);
    assert.equal(active(rows, "b-fog", "ard").length, 0);
  });

  it("mapa não jogado ou empatado não conta nem quebra a sequência", () => {
    const { rows } = computeBadges({ matches: [mix([W, [null, null], W]), mix([[12, 12], W])], badges: [FOGUINHO] });
    assert.equal(active(rows, "b-fog", "ard").length, 1);
  });

  it("não mistura jogadores: o rival não ganha nada", () => {
    const { rows } = computeBadges({ matches: [mix([W, W, W])], badges: [FOGUINHO] });
    assert.equal(of(rows, "b-fog", "barker").length, 0);
  });
});

describe("Pé Frio (derrotas seguidas em mapas)", () => {
  it("3 derrotas concedem Pé Frio e uma vitória encerra", () => {
    const one = computeBadges({ matches: [mix([L, L, L])], badges: [PE_FRIO] });
    assert.equal(active(one.rows, "b-pe", "ard").length, 1);
    const two = computeBadges({ matches: [mix([L, L, L]), mix([W])], badges: [PE_FRIO] });
    assert.equal(active(two.rows, "b-pe", "ard").length, 0);
    assert.match(of(two.rows, "b-pe", "ard")[0]!.endReason!, /vitória/);
  });
});

describe("Rei do Mix (liderança do ranking)", () => {
  it("concede ao líder e passa para quem o ultrapassa", () => {
    const m1 = mix([W], { records: [rec("ard", "A", { eloAfter: 1100 }), rec("barker", "B", { eloAfter: 900 })] });
    const m2 = mix([L, L], { records: [rec("ard", "A", { eloAfter: 950 }), rec("barker", "B", { eloAfter: 1050 })] });
    const first = computeBadges({ matches: [m1], badges: [REI] });
    assert.equal(active(first.rows, "b-rei", "ard").length, 1);
    const second = computeBadges({ matches: [m1, m2], badges: [REI] });
    assert.equal(active(second.rows, "b-rei", "ard").length, 0);
    assert.equal(active(second.rows, "b-rei", "barker").length, 1);
    assert.equal(of(second.rows, "b-rei", "ard").length, 1, "o reinado do ard fica no histórico");
  });

  it("respeita o mínimo de mixes para ser elegível", () => {
    const strict = { ...REI, params: { min_mixes: 2 } };
    const { rows } = computeBadges({
      matches: [mix([W], { records: [rec("ard", "A", { eloAfter: 1100 }), rec("barker", "B", { eloAfter: 900 })] })],
      badges: [strict],
    });
    assert.equal(rows.length, 0);
  });

  it("empate de ELO: desempata pela taxa de vitória", () => {
    const { rows } = computeBadges({
      matches: [mix([L], { records: [rec("ard", "A", { eloAfter: 1000 }), rec("barker", "B", { eloAfter: 1000 })] })],
      badges: [REI],
    });
    assert.equal(active(rows, "b-rei", "barker").length, 1);
  });

  it("ajuste manual de ELO depois do último mix muda o líder", () => {
    const m1 = mix([W], { records: [rec("ard", "A", { eloAfter: 1100 }), rec("barker", "B", { eloAfter: 900 })] });
    const { rows } = computeBadges({
      matches: [m1],
      badges: [REI],
      currentElo: new Map([
        ["ard", 1000],
        ["barker", 1200],
      ]),
      now: "2026-10-19T12:00:00.000Z",
    });
    assert.equal(active(rows, "b-rei", "barker").length, 1);
    assert.equal(active(rows, "b-rei", "ard").length, 0);
  });
});

describe("Resultados editados e reprocessamento", () => {
  it("corrigir um placar recalcula as conquistas afetadas", () => {
    const m1 = mix([W, W]);
    const m2 = mix([W]);
    const before = computeBadges({ matches: [m1, m2], badges: [FOGUINHO] });
    assert.equal(active(before.rows, "b-fog", "ard").length, 1);
    const fixed = { ...m2, maps: [{ ...m2.maps[0]!, scoreA: 7, scoreB: 13 }] };
    const after = computeBadges({ matches: [m1, fixed], badges: [FOGUINHO] });
    assert.equal(of(after.rows, "b-fog", "ard").length, 0, "a conquista deixa de existir");
  });

  it("excluir um mix recalcula", () => {
    const m1 = mix([W, W]);
    const m2 = mix([W]);
    assert.equal(computeBadges({ matches: [m1], badges: [FOGUINHO] }).rows.length, 0);
    assert.equal(computeBadges({ matches: [m1, m2], badges: [FOGUINHO] }).rows.length, 1);
  });

  it("os mesmos dados geram exatamente o mesmo resultado (sem duplicar)", () => {
    const matches = [mix([W, W, W]), mix([L]), mix([W, W, W])];
    const a = computeBadges({ matches, badges: [FOGUINHO, PE_FRIO, MVP] });
    const b = computeBadges({ matches: [...matches].reverse(), badges: [FOGUINHO, PE_FRIO, MVP] });
    assert.deepEqual(a, b);
    const refs = a.rows.map((r) => `${r.userId}|${r.badgeId}|${r.sourceRef}`);
    assert.equal(new Set(refs).size, refs.length);
  });
});

describe("Permanentes, MVP, consistência, mapa e subida", () => {
  it("Veterano é permanente: continua depois de derrotas", () => {
    const { rows } = computeBadges({ matches: [mix([W]), mix([L]), mix([L, L, L])], badges: [VETERANO] });
    const v = of(rows, "b-vet", "ard");
    assert.equal(v.length, 1);
    assert.equal(v[0]!.deactivatedAt, null);
  });

  it("MVP passa para o MVP do mix seguinte", () => {
    const m1 = mix([W], { records: [rec("ard", "A", { isMvp: true }), rec("barker", "B")] });
    const m2 = mix([L], { records: [rec("ard", "A"), rec("barker", "B", { isMvp: true })] });
    const { rows } = computeBadges({ matches: [m1, m2], badges: [MVP] });
    assert.equal(active(rows, "b-mvp", "ard").length, 0);
    assert.equal(active(rows, "b-mvp", "barker").length, 1);
  });

  it("Consistente exige nota mínima em todos os últimos N mixes", () => {
    const bad = rec("ard", "A", { kills: 2, deaths: 20, adr: 20, kast: 30 });
    const ok = computeBadges({ matches: [mix([W]), mix([W])], badges: [CONSISTENTE] });
    assert.equal(active(ok.rows, "b-con", "ard").length, 1);
    const broken = computeBadges({
      matches: [mix([W]), mix([W]), mix([L], { records: [bad, rec("barker", "B")] })],
      badges: [CONSISTENTE],
    });
    assert.equal(active(broken.rows, "b-con", "ard").length, 0);
  });

  it("Rei do Mapa vai para o melhor aproveitamento no mapa", () => {
    const { rows } = computeBadges({ matches: [mix([W]), mix([W])], badges: [REI_MAPA] });
    const r = active(rows, "b-map", "ard");
    assert.equal(r.length, 1);
    assert.equal(r[0]!.scope, "de_mirage");
  });

  it("Foguete: subir o mínimo de posições na janela", () => {
    const records = (elos: Record<string, number>) =>
      Object.entries(elos).map(([u, e], i) => rec(u, i % 2 ? "B" : "A", { eloAfter: e }));
    const m1 = mix([W], { records: records({ ard: 800, p1: 1000, p2: 950, p3: 900 }) });
    const m2 = mix([W], { records: records({ ard: 1100, p1: 1000, p2: 950, p3: 900 }) });
    const { rows } = computeBadges({ matches: [m1, m2], badges: [FOGUETE] });
    assert.equal(active(rows, "b-fgt", "ard").length, 1);
  });
});

describe("Lanterna", () => {
  const lanterna = (user: "ard" | "barker") =>
    mix([W], {
      records: [rec("ard", "A", { isLanterna: user === "ard" }), rec("barker", "B", { isLanterna: user === "barker" })],
    });

  it("Lanterna vai para o lanterna do último mix e passa adiante", () => {
    const { rows } = computeBadges({ matches: [lanterna("ard"), lanterna("barker")], badges: [LANTERNA] });
    assert.equal(active(rows, "b-lan", "ard").length, 0);
    assert.equal(active(rows, "b-lan", "barker").length, 1);
    assert.match(of(rows, "b-lan", "ard")[0]!.endReason!, /Novo lanterna/);
  });

  it("Lanterna Vermelha: 3 mixes seguidos como lanterna", () => {
    const two = computeBadges({ matches: [lanterna("ard"), lanterna("ard")], badges: [LANTERNA_VERMELHA] });
    assert.equal(of(two.rows, "b-lv", "ard").length, 0);
    assert.deepEqual(
      two.progress.find((p) => p.userId === "ard" && p.badgeId === "b-lv"),
      { userId: "ard", badgeId: "b-lv", current: 2, target: 3 },
      "progresso 2/3",
    );
    const three = computeBadges({
      matches: [lanterna("ard"), lanterna("ard"), lanterna("ard")],
      badges: [LANTERNA_VERMELHA],
    });
    assert.equal(active(three.rows, "b-lv", "ard").length, 1);
  });

  it("Lanterna Vermelha sai no primeiro mix fora da lanterna (histórico fica)", () => {
    const { rows } = computeBadges({
      matches: [lanterna("ard"), lanterna("ard"), lanterna("ard"), lanterna("barker")],
      badges: [LANTERNA_VERMELHA],
    });
    assert.equal(active(rows, "b-lv", "ard").length, 0);
    assert.equal(of(rows, "b-lv", "ard").length, 1);
  });

  it("mix que o jogador não jogou não quebra nem soma a sequência", () => {
    const solo = mix([W], { records: [rec("barker", "B"), rec("p3", "A")] });
    const { rows } = computeBadges({
      matches: [lanterna("ard"), lanterna("ard"), solo, lanterna("ard")],
      badges: [LANTERNA_VERMELHA],
    });
    assert.equal(active(rows, "b-lv", "ard").length, 1);
  });
});
