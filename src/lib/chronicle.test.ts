/** Testes da crônica do mix: `npm run test:cronica`. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  checkAiChronicle,
  chronicleFacts,
  chronicleText,
  templateChronicle,
  type ChronicleInput,
  type ChroniclePlayer,
} from "./chronicle";

const P = (
  name: string,
  team: "A" | "B",
  k: number,
  a: number,
  d: number,
  adr: number,
  fk: number,
  rp: number,
  extra: Partial<ChroniclePlayer> = {},
): ChroniclePlayer => ({ id: name, name, team, k, a, d, adr, fk, rp, isMvp: false, isLanterna: false, ...extra });

/** Mix de 20/10/2026 (dados reais da tela). */
const INPUT: ChronicleInput = {
  seed: "mix-2010",
  date: "2026-10-20",
  teams: { A: "Time arD", B: "Time AlexS-" },
  maps: [
    { name: "Dust II", scoreA: 13, scoreB: 11 },
    { name: "Inferno", scoreA: 13, scoreB: 11 },
    { name: "Mirage", scoreA: 13, scoreB: 10 },
  ],
  players: [
    P("arD", "A", 64, 16, 50, 86.8, 16, 52, { isMvp: true }),
    P("Canindex", "A", 59, 21, 51, 90.4, 7, 58),
    P("Barker", "B", 57, 21, 51, 92.4, 10, -25),
    P("paiked1", "B", 52, 14, 50, 79.1, 5, -36),
    P("detonic", "A", 51, 18, 45, 80.5, 5, 39),
    P("belongeR", "B", 48, 20, 53, 76.5, 11, -31),
    P("Nasa", "A", 42, 14, 46, 62.1, 6, 27),
    P("AlexS-", "B", 38, 15, 50, 60.0, 5, -45),
    P("Cypher", "A", 36, 28, 41, 64.6, 3, 38),
    P("Kajura", "B", 36, 15, 49, 57.7, 3, -43, { isLanterna: true }),
  ],
  history: {
    arD: { mixes: 3, winStreak: 3, lossStreak: 0, lanternaStreak: 0, mvpStreak: 1 },
    Canindex: { mixes: 1, winStreak: 1, lossStreak: 0, lanternaStreak: 0, mvpStreak: 0 },
    Kajura: { mixes: 3, winStreak: 0, lossStreak: 3, lanternaStreak: 2, mvpStreak: 0 },
  },
  leader: { name: "Canindex", elo: 1068 },
  bolao: { bets: 6, winnerHits: 4, mvpHits: 2, lanternaHits: 0, best: { names: ["detonic"], points: 8 } },
};

describe("chronicleFacts", () => {
  const facts = chronicleFacts(INPUT);
  it("traz o resultado, os destaques e as sequências", () => {
    const all = facts.join("\n");
    assert.match(all, /Time arD venceu Time AlexS- por 3 a 0/);
    assert.match(all, /decididos por 3 rounds ou menos/);
    assert.match(all, /MVP: arD/);
    assert.match(all, /Lanterna \(pior desempenho\): Kajura/);
    assert.match(all, /Maior ADR: Barker \(92,4\)/);
    assert.match(all, /Mais assistências: Cypher \(28\)/);
    assert.match(all, /Mais mortes: belongeR \(53\)/);
    assert.match(all, /Kajura foi lanterna 2 mixes seguidos/);
    assert.match(all, /Canindex estreou/);
    assert.match(all, /Líder do ranking agora: Canindex, com 1068/);
  });
});

describe("templateChronicle", () => {
  const c = templateChronicle(INPUT);
  it("monta a crônica sem IA, com a lanterna no fim", () => {
    assert.match(c.intro, /varrida/);
    assert.ok(c.items.length >= 5 && c.items.length <= 7);
    assert.match(c.items[0]!.title, /^arD/);
    assert.match(c.items.at(-1)!.title, /Lanterna: Kajura/);
    assert.match(c.items.at(-1)!.text, /Segunda lanterna seguida/);
    const titles = c.items.map((i) => i.title).join(" | ");
    assert.match(titles, /Canindex/);
    assert.match(titles, /Barker/);
    assert.match(titles, /Cypher, o garçom oficial/);
    assert.match(c.closing, /detonic levou a melhor com 8 pontos/);
  });

  it("no primeiro mix registrado (todos estreando), estreia não vira tópico", () => {
    const first = {
      ...INPUT,
      history: Object.fromEntries(
        INPUT.players.map((p) => [p.id!, { mixes: 1, winStreak: 0, lossStreak: 0, lanternaStreak: 0, mvpStreak: 0 }]),
      ),
    };
    assert.ok(!templateChronicle(first).items.some((i) => i.emoji === "🆕"));
    assert.ok(!chronicleFacts(first).some((f) => f.includes("estreou")));
  });

  it("é estável para o mesmo mix e passa na própria trava de números", () => {
    assert.deepEqual(templateChronicle(INPUT), c);
    assert.ok(checkAiChronicle(c, chronicleFacts(INPUT), INPUT));
  });
});

describe("checkAiChronicle", () => {
  const facts = chronicleFacts(INPUT);
  const ok = {
    headline: "Edição sem dó",
    intro: "Três mapas, três vezes morrendo na praia.",
    items: [
      { emoji: "👑", title: "arD", text: "64 kills e 16 first kills." },
      { emoji: "😤", title: "Barker", text: "ADR de 92,4 e −25 de RP." },
      { emoji: "🔦", title: "Lanterna: Kajura", text: "2ª lanterna seguida." },
    ],
    closing: "Canindex lidera com 1068.",
  };

  it("aceita texto que só usa números dos fatos", () => {
    assert.ok(checkAiChronicle(ok, facts, INPUT));
  });

  it("recusa número inventado", () => {
    const bad = { ...ok, items: [...ok.items, { emoji: "🤡", title: "Nasa", text: "fez 99 kills" }] };
    assert.equal(checkAiChronicle(bad, facts, INPUT), null);
  });

  it("recusa estrutura incompleta", () => {
    assert.equal(checkAiChronicle({ ...ok, items: ok.items.slice(0, 2) }, facts, INPUT), null);
    assert.equal(checkAiChronicle("texto solto", facts, INPUT), null);
  });
});

describe("chronicleText", () => {
  it("formata para o WhatsApp com placar e mapas", () => {
    const text = chronicleText(templateChronicle(INPUT), INPUT, "https://meumix.vercel.app/mixes/outubro20");
    assert.match(text, /^📰 \*CRÔNICA DO MIX — 20\/10\*/);
    assert.match(text, /🏆 \*Time arD 3 × 0 Time AlexS-\*/);
    assert.match(text, /Dust II 13-11 · Inferno 13-11 · Mirage 13-10/);
    assert.match(text, /https:\/\/meumix\.vercel\.app\/mixes\/outubro20$/);
    assert.doesNotMatch(text, /\n{3,}/);
  });
});
