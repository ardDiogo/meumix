/**
 * Crônica do mix: texto zoeiro ("edição sem dó") montado a partir dos fatos da
 * partida. Funções puras, testadas em `chronicle.test.ts`:
 * - `chronicleFacts`: o que aconteceu, em frases com os números oficiais;
 * - `templateChronicle`: crônica pronta sem IA (também é o plano B da IA);
 * - `checkAiChronicle`: aceita o texto da IA só se ele não inventar números;
 * - `chronicleText`: versão para o WhatsApp.
 */

export interface ChronicleItem {
  emoji: string;
  title: string;
  text: string;
}

export interface Chronicle {
  headline: string;
  intro: string;
  items: ChronicleItem[];
  closing: string;
}

export interface ChroniclePlayer {
  id: string | null;
  name: string;
  team: "A" | "B";
  k: number;
  a: number;
  d: number;
  adr: number | null;
  fk: number;
  rp: number;
  isMvp: boolean;
  isLanterna: boolean;
}

/** Sequências do jogador até este mix (inclusive) e quantos mixes ele tem. */
export interface PlayerHistory {
  mixes: number;
  winStreak: number;
  lossStreak: number;
  lanternaStreak: number;
  mvpStreak: number;
}

export interface ChronicleInput {
  /** Semente para variar as frases entre mixes (ex.: id da partida). */
  seed: string;
  date: string;
  teams: { A: string; B: string };
  maps: { name: string; scoreA: number | null; scoreB: number | null }[];
  players: ChroniclePlayer[];
  history: Record<string, PlayerHistory>;
  leader: { name: string; elo: number } | null;
  bolao: {
    bets: number;
    winnerHits: number;
    mvpHits: number;
    lanternaHits: number;
    best: { names: string[]; points: number } | null;
  } | null;
}

/* -------------------------------- Auxiliares ------------------------------- */

const dec = (n: number, digits = 1) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const kdr = (p: ChroniclePlayer) => (p.d ? p.k / p.d : p.k);
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
const maxBy = <T>(list: T[], value: (x: T) => number) =>
  list.reduce<T | null>((best, x) => (best == null || value(x) > value(best) ? x : best), null);
const minBy = <T>(list: T[], value: (x: T) => number) => maxBy(list, (x) => -value(x));

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
/** Escolhe uma variação de frase de forma estável para o mesmo mix. */
const pick = <T>(list: T[], seed: string, key: string) => list[hash(`${seed}:${key}`) % list.length]!;

export function seriesOf(input: ChronicleInput) {
  let a = 0;
  let b = 0;
  const diffs: number[] = [];
  for (const m of input.maps) {
    if (m.scoreA == null || m.scoreB == null || m.scoreA === m.scoreB) continue;
    if (m.scoreA > m.scoreB) a++;
    else b++;
    diffs.push(Math.abs(m.scoreA - m.scoreB));
  }
  const winner = a > b ? "A" : b > a ? "B" : null;
  return { a, b, winner, diffs } as const;
}

/** Linha do placar: "Time arD 3 × 0 Time AlexS-". */
export function scoreLine(input: ChronicleInput) {
  const s = seriesOf(input);
  return `${input.teams.A} ${s.a} × ${s.b} ${input.teams.B}`;
}

export const mapsLine = (input: ChronicleInput) =>
  input.maps.map((m) => `${m.name} ${m.scoreA ?? "-"}-${m.scoreB ?? "-"}`).join(" · ");

const WORDS = ["zero", "um", "dois", "três", "quatro", "cinco"];
const word = (n: number) => WORDS[n] ?? String(n);
const capitalize = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

const dayMonth = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;

/* ---------------------------------- Fatos ---------------------------------- */

/** Fatos do mix em frases curtas, com os números oficiais (a IA só pode usar estes). */
export function chronicleFacts(input: ChronicleInput): string[] {
  const s = seriesOf(input);
  const ps = input.players;
  const facts: string[] = [];
  const team = (side: "A" | "B") => input.teams[side];
  facts.push(
    s.winner
      ? `Resultado: ${team(s.winner)} venceu ${team(s.winner === "A" ? "B" : "A")} por ${Math.max(s.a, s.b)} a ${Math.min(s.a, s.b)} em mapas.`
      : `Resultado: empate em ${s.a} a ${s.b} em mapas.`,
  );
  facts.push(`Mapas: ${mapsLine(input)}.`);
  if (s.diffs.length && s.diffs.every((d) => d <= 3))
    facts.push("Todos os mapas foram decididos por 3 rounds ou menos.");
  if (s.diffs.length && s.diffs.every((d) => d >= 7))
    facts.push("Todos os mapas foram vencidos com folga (7 rounds ou mais).");
  for (const side of ["A", "B"] as const) {
    facts.push(
      `${team(side)}: ${ps
        .filter((p) => p.team === side)
        .map((p) => p.name)
        .join(", ")}.`,
    );
  }
  const line = (p: ChroniclePlayer) =>
    `${p.k} kills, ${p.a} assistências, ${p.d} mortes, ADR ${p.adr == null ? "-" : dec(p.adr)}, KDR ${dec(kdr(p), 2)}, ${p.fk} first kills, RP ${signed(p.rp)}`;
  for (const p of ps) facts.push(`${p.name} (${team(p.team)}): ${line(p)}.`);

  const mvp = ps.find((p) => p.isMvp);
  const lant = ps.find((p) => p.isLanterna);
  if (mvp) facts.push(`MVP: ${mvp.name}.`);
  if (lant) facts.push(`Lanterna (pior desempenho): ${lant.name}.`);
  const top = (label: string, p: ChroniclePlayer | null, value: string) =>
    p && facts.push(`${label}: ${p.name} (${value}).`);
  const kills = maxBy(ps, (p) => p.k);
  top("Mais kills", kills, `${kills?.k}`);
  const adr = maxBy(
    ps.filter((p) => p.adr != null),
    (p) => p.adr!,
  );
  top("Maior ADR", adr, adr?.adr == null ? "" : dec(adr.adr));
  const ast = maxBy(ps, (p) => p.a);
  top("Mais assistências", ast, `${ast?.a}`);
  const deaths = maxBy(ps, (p) => p.d);
  top("Mais mortes", deaths, `${deaths?.d}`);
  const fk = maxBy(ps, (p) => p.fk);
  top("Mais first kills", fk, `${fk?.fk}`);
  const lowFk = minBy(ps, (p) => p.fk);
  top("Menos first kills", lowFk, `${lowFk?.fk}`);
  const rpUp = maxBy(ps, (p) => p.rp);
  top("Maior ganho de RP", rpUp, signed(rpUp?.rp ?? 0));
  const rpDown = minBy(ps, (p) => p.rp);
  top("Maior perda de RP", rpDown, signed(rpDown?.rp ?? 0));

  // Estreia só é notícia se for de poucos (no primeiro mix registrado, todo mundo "estreia").
  const debuts = ps.filter((p) => p.id && input.history[p.id]?.mixes === 1);
  for (const p of ps) {
    const h = p.id ? input.history[p.id] : undefined;
    if (!h) continue;
    if (h.mixes === 1 && debuts.length <= 2) facts.push(`${p.name} estreou no MeuMix neste mix.`);
    if (p.isLanterna && h.lanternaStreak >= 2) facts.push(`${p.name} foi lanterna ${h.lanternaStreak} mixes seguidos.`);
    if (p.isMvp && h.mvpStreak >= 2) facts.push(`${p.name} foi MVP ${h.mvpStreak} mixes seguidos.`);
    if (h.winStreak >= 3) facts.push(`${p.name} venceu ${h.winStreak} mixes seguidos.`);
    if (h.lossStreak >= 3) facts.push(`${p.name} perdeu ${h.lossStreak} mixes seguidos.`);
  }
  if (input.leader) facts.push(`Líder do ranking agora: ${input.leader.name}, com ${input.leader.elo} de ELO.`);
  const b = input.bolao;
  if (b?.bets) {
    facts.push(
      `Bolão: ${b.bets} palpites; ${b.winnerHits} acertaram o vencedor, ${b.mvpHits} acertaram o MVP e ${b.lanternaHits} acertaram a lanterna.`,
    );
    if (b.best?.points) facts.push(`Melhor no bolão: ${b.best.names.join(", ")}, com ${b.best.points} pontos.`);
  }
  return facts;
}

/* --------------------------------- Modelo --------------------------------- */

/** Crônica pronta (sem IA), no tom "sem dó": zoa o desempenho, nunca a pessoa. */
export function templateChronicle(input: ChronicleInput): Chronicle {
  const s = seriesOf(input);
  const ps = input.players;
  const seed = input.seed;
  const items: ChronicleItem[] = [];
  const used = new Set<string>();
  const add = (p: ChroniclePlayer | null | undefined, item: ChronicleItem | null) => {
    if (!p || !item || used.has(p.name) || items.length >= 7) return;
    used.add(p.name);
    items.push(item);
  };
  const hist = (p: ChroniclePlayer) => (p.id ? input.history[p.id] : undefined);
  const winners = s.winner ? ps.filter((p) => p.team === s.winner) : [];
  const losers = s.winner ? ps.filter((p) => p.team !== s.winner) : [];
  const loserTeam = s.winner ? input.teams[s.winner === "A" ? "B" : "A"] : null;

  // Abertura pelo jeito que o placar saiu.
  const close = s.diffs.length > 0 && s.diffs.every((d) => d <= 3);
  const rout = s.diffs.length > 0 && s.diffs.every((d) => d >= 7);
  const sweep = s.winner && Math.min(s.a, s.b) === 0;
  const intro = !s.winner
    ? "Empate. Ninguém ganhou, ninguém perdeu, todo mundo saiu devendo. Um mix inteiro para provar absolutamente nada."
    : sweep && close
      ? `${capitalize(word(s.a + s.b))} mapas, ${word(s.a + s.b)} chances, ${word(s.a + s.b)} vezes morrendo na praia. O ${loserTeam} conseguiu a façanha de jogar parelho a noite inteira e mesmo assim tomar uma varrida. Não é azar, é talento para amarelar.`
      : sweep && rout
        ? `Não foi jogo, foi atropelo. O ${loserTeam} entrou no servidor só para fazer volume e cumpriu a missão com louvor.`
        : sweep
          ? `Varrida sem choro: o ${loserTeam} não levou um mapa sequer para casa. Saiu do servidor do jeito que entrou: zerado.`
          : `Foi no detalhe, mas foi. O ${loserTeam} ainda arrancou um mapa, o suficiente para sair achando que jogou bem.`;

  const mvp = ps.find((p) => p.isMvp);
  if (mvp)
    add(mvp, {
      emoji: "👑",
      title: `${mvp.name}, ${pick(["o dono da casa", "o dono do servidor", "o patrão da noite"], seed, "mvp")}`,
      text: `${mvp.k} kills, ${mvp.fk} first kills e o MVP. ${pick(
        [
          "Entrou no servidor, abriu o round, voltou e abriu de novo. O outro time jogou contra 5; na prática, contra 1.",
          "O resto do time só precisou não atrapalhar, e nem isso fez direito.",
          "Jogou como se o mix valesse salário. Os outros jogaram como se fosse estágio.",
        ],
        seed,
        "mvp-t",
      )}`,
    });

  const debuts = ps.filter((x) => hist(x)?.mixes === 1);
  for (const p of debuts.length <= 2 ? debuts : []) {
    const good = p.rp > 0 || kdr(p) >= 1;
    add(p, {
      emoji: "🆕",
      title: p.name,
      text: good
        ? `estreou com ${p.k} kills e ${signed(p.rp)} de RP. Ninguém sabe direito quem é, mas todo mundo sabe que perdeu pra ele.`
        : `estreia com ${p.k} kills, ${p.d} mortes e ${signed(p.rp)} de RP. Primeira impressão é a que fica, infelizmente.`,
    });
  }

  // Quem fez tudo e perdeu: maior ADR (ou mais kills) do time derrotado.
  const loserStar = maxBy(losers, (p) => p.adr ?? p.k);
  const topAdr = maxBy(
    ps.filter((p) => p.adr != null),
    (p) => p.adr!,
  );
  if (loserStar && loserStar.rp < 0)
    add(loserStar, {
      emoji: "😤",
      title: loserStar.name,
      text: `${loserStar === topAdr ? `maior ADR do mix (${dec(loserStar.adr!)})` : `${loserStar.k} kills`} e saiu com ${signed(loserStar.rp)} de RP. ${pick(
        [
          "Fez a parte dele e a de mais dois, e ainda assim pagou a conta. Os amigos agradecem a pensão.",
          "Carregou o time nas costas até a porta do vestiário. Lá dentro, derrota igual pra todo mundo.",
          "Jogou o suficiente para ganhar. O problema foram os outros quatro.",
        ],
        seed,
        "star",
      )}`,
    });

  const assists = maxBy(ps, (p) => p.a);
  if (assists && assists.a >= 15)
    add(assists, {
      emoji: "🤝",
      title: `${assists.name}, o garçom oficial`,
      text: `${assists.a} assistências. Deu o dano e deixou a kill para os outros, como um bom funcionário do mês.${
        kdr(assists) < 1 ? ` KDR ${dec(kdr(assists), 2)}: generoso até demais.` : ""
      }`,
    });

  const lant = ps.find((p) => p.isLanterna);
  const deaths = maxBy(ps, (p) => p.d);
  if (deaths && deaths !== lant)
    add(deaths, {
      emoji: "🧱",
      title: deaths.name,
      text: `${deaths.d} mortes, recorde da noite. ${
        deaths.fk >= 8
          ? `Não é entry fragger, é tapete de entrada. Pelo menos as ${deaths.fk} first kills provam que ele chegou primeiro… para morrer em seguida.`
          : "Morreu tanto que o respawn pediu férias."
      }`,
    });

  const drop = minBy(
    ps.filter((p) => p !== lant),
    (p) => p.rp,
  );
  if (drop && drop.rp <= -30) {
    const captain = input.teams[drop.team] === `Time ${drop.name}`;
    add(drop, {
      emoji: "📉",
      title: drop.name,
      text: captain
        ? `emprestou o nome ao time e só isso. KDR ${dec(kdr(drop), 2)} e ${signed(drop.rp)} de RP, a maior queda da noite. Capitão de navio que afunda junto.`
        : `${signed(drop.rp)} de RP e KDR ${dec(kdr(drop), 2)}, a maior queda da noite. ${pick(
            [
              "Desceu mais que elevador com o cabo arrebentado.",
              "Se o ELO tivesse sentimento, pediria para trocar de dono.",
              "O ranking agradece a doação.",
            ],
            seed,
            "drop",
          )}`,
    });
  }

  for (const p of winners) {
    const h = hist(p);
    if (h && h.winStreak >= 3)
      add(p, {
        emoji: "🔥",
        title: p.name,
        text: `${h.winStreak} vitórias seguidas. Já está na hora de alguém avisar que ele não está jogando contra bots.`,
      });
  }
  for (const p of losers) {
    const h = hist(p);
    if (h && h.lossStreak >= 3 && !p.isLanterna)
      add(p, {
        emoji: "🥶",
        title: p.name,
        text: `${h.lossStreak} derrotas seguidas. Pé frio oficial: quem cai no time dele já começa perdendo.`,
      });
  }

  // Reservas, para a crônica não ficar curta (no máximo 6 antes da lanterna).
  const room = () => items.length < 6;
  const fresh = (p: ChroniclePlayer | null) => (p && !used.has(p.name) && p !== lant ? p : null);
  const killer = fresh(maxBy(ps, (p) => p.k));
  if (room() && killer)
    add(killer, {
      emoji: "🎯",
      title: killer.name,
      text: `${killer.k} kills, o maior número da noite. ${pick(
        ["Pelo menos alguém lembrou que dá para atirar.", "Matou tanto que o servidor pediu trégua."],
        seed,
        "killer",
      )}`,
    });
  const opener = fresh(maxBy(ps, (p) => p.fk));
  if (room() && opener && opener.fk >= 8)
    add(opener, {
      emoji: "⚡",
      title: opener.name,
      text: `${opener.fk} first kills. Abriu o round antes de o time inimigo terminar de comprar.`,
    });
  const baiter = fresh(minBy(ps, (p) => p.fk));
  if (room() && baiter && baiter.fk <= 3)
    add(baiter, {
      emoji: "🐔",
      title: `${baiter.name}, o baiter`,
      text: `${baiter.fk} first kill${baiter.fk === 1 ? "" : "s"} na noite toda. Esperou tanto o time abrir o bomb que o round acabou.`,
    });

  if (lant) {
    const streak = hist(lant)?.lanternaStreak ?? 1;
    const stats = `${lant.k} kills, ${lant.d} mortes${lant.adr == null ? "" : `, ${dec(lant.adr)} de ADR`}.`;
    // A lanterna fecha a lista, sempre.
    if (items.length >= 7) items.pop();
    used.add(lant.name);
    items.push({
      emoji: "🔦",
      title: `Lanterna: ${lant.name}`,
      text:
        streak >= 3
          ? `${stats} *${streak}ª lanterna seguida.* Lanterna Vermelha garantida: já pode emoldurar.`
          : streak === 2
            ? `${stats} *Segunda lanterna seguida.* Mais uma e ganha a Lanterna Vermelha com direito a moldura. O próximo mix não é jogo, é julgamento.`
            : `${stats} ${pick(
                [
                  "Alguém tinha que segurar a lanterna, e ele se ofereceu sem ninguém pedir.",
                  "Jogou com o monitor desligado e a gente respeita a coragem.",
                  "Contribuiu com o time do jeito que deu: pouco.",
                ],
                seed,
                "lant",
              )}`,
    });
  }

  const closing: string[] = [];
  const b = input.bolao;
  if (b?.bets) {
    closing.push(
      b.best?.points
        ? `🎲 Bolão: ${b.bets} palpites e ${b.best.names.join(", ")} levou a melhor com ${b.best.points} pontos.${
            b.lanternaHits ? "" : " Ninguém acertou a lanterna."
          }`
        : `🎲 Bolão: ${b.bets} palpites e ninguém pontuou. Vidência não é o forte da comunidade.`,
    );
  }
  if (input.leader) closing.push(`📊 ${input.leader.name} lidera o ranking com ${input.leader.elo} de ELO.`);

  return { headline: "Edição sem dó", intro, items, closing: closing.join("\n") };
}

/* ------------------------------ Trava da IA ------------------------------ */

const numbersIn = (text: string) => (text.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => Number(n.replace(",", ".")));

/** Números que aparecem nos fatos (inclui data, placares e formatos com vírgula). */
function allowedNumbers(facts: string[], input: ChronicleInput) {
  const set = new Set<number>();
  for (const n of numbersIn(facts.join(" "))) set.add(n);
  for (const n of numbersIn(input.date)) set.add(n);
  for (const n of numbersIn(dayMonth(input.date))) set.add(n);
  return set;
}

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Normaliza uma crônica vinda de fora (IA ou edição do admin). Null se faltar o essencial. */
export function sanitizeChronicle(raw: unknown, minItems = 3): Chronicle | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const items = Array.isArray(r.items)
    ? r.items
        .map((i) => ({
          emoji: clean((i as Record<string, unknown>)?.emoji, 8) || "•",
          title: clean((i as Record<string, unknown>)?.title, 70),
          text: clean((i as Record<string, unknown>)?.text, 320),
        }))
        .filter((i) => i.title && i.text)
    : [];
  const c: Chronicle = {
    headline: clean(r.headline, 60) || "Edição sem dó",
    intro: clean(r.intro, 400),
    items: items.slice(0, 8),
    closing: typeof r.closing === "string" ? r.closing.trim().slice(0, 300) : "",
  };
  return c.intro && c.items.length >= minItems ? c : null;
}

/**
 * Valida a crônica escrita pela IA: estrutura, tamanhos e nenhum número que não
 * esteja nos fatos (números até 5 são livres: "2ª", "3 mapas"…). Null se não servir.
 */
export function checkAiChronicle(raw: unknown, facts: string[], input: ChronicleInput): Chronicle | null {
  const c = sanitizeChronicle(raw);
  if (!c) return null;
  const allowed = allowedNumbers(facts, input);
  const text = [c.headline, c.intro, c.closing, ...c.items.flatMap((i) => [i.title, i.text])].join(" ");
  const invented = numbersIn(text).filter((n) => n > 5 && !allowed.has(n));
  return invented.length ? null : c;
}

/* -------------------------------- WhatsApp -------------------------------- */

/** Texto da crônica no formato do WhatsApp (*negrito*, _itálico_). */
export function chronicleText(c: Chronicle, input: Pick<ChronicleInput, "date" | "teams" | "maps">, link?: string) {
  const full = { ...input, seed: "", players: [], history: {}, leader: null, bolao: null } as ChronicleInput;
  const lines = [
    `📰 *CRÔNICA DO MIX — ${dayMonth(input.date)}*`,
    c.headline ? `_${c.headline}_` : "",
    "",
    `🏆 *${scoreLine(full)}*`,
    mapsLine(full),
    "",
    c.intro,
    "",
    ...c.items.flatMap((i) => [`${i.emoji} *${i.title}*: ${i.text}`, ""]),
    ...(c.closing ? [c.closing, ""] : []),
    ...(link ? [link] : []),
  ];
  return lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
