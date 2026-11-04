/**
 * Análise da partida, jogador por jogador (página do mix), com os dados
 * importados da GC: dois ou três fatos com números e uma dica prática.
 * - `matchAnalysis`: versão por regras (sempre disponível);
 * - `analysisSheet`: ficha com todos os números de cada jogador, para a IA;
 * - `checkAiAnalysis`: aceita o texto da IA de cada jogador só se ele não
 *   inventar números (quem falhar fica com o texto das regras).
 */
import type { GcMapStored } from "./gc-api";
import { aggregateGc, type GcLine } from "./gc-analysis";

export interface AnalysisParagraph {
  key: string;
  userId: string | null;
  name: string;
  /** Fatos (com números) e a dica, já em frases. */
  facts: string[];
  tip: string | null;
  /** Texto escrito pela IA (substitui os fatos e a dica das regras). */
  text?: string;
  /** Resenha no tom da crônica ("sem dó"), escrita pela IA. */
  roast?: string;
}

/** Texto da IA por jogador (chave = `GcLine.key`). */
export type AiAnalysis = Record<string, { text: string; tip: string; roast?: string }>;

export interface AnalysisTeam {
  side: "A" | "B";
  won: boolean | null;
  players: AnalysisParagraph[];
}

const dec = (n: number, d = 2) => n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (part: number, total: number) => (total ? Math.round((part / total) * 100) : 0);

/** Rating de cada mapa do jogador (na ordem dos mapas). */
function perMap(maps: GcMapStored[], line: GcLine, mapName: (id: string) => string) {
  return maps.flatMap((m) => {
    const p = m.players.find((x) => (x.userId ?? `gc:${x.gcId}`) === line.key);
    return p?.rating != null ? [{ map: mapName(m.mapId), rating: p.rating, weapon: p.aim?.mainWeapon ?? null }] : [];
  });
}

/**
 * Um parágrafo por jogador, por time (vencedor primeiro), do melhor rating
 * para o pior. `names` traz o nome de exibição de cada jogador do MeuMix.
 */
export function matchAnalysis(
  maps: GcMapStored[],
  opts: {
    winner: "A" | "B" | null;
    names?: Record<string, string>;
    mapName: (id: string) => string;
    ai?: AiAnalysis | null;
  },
): AnalysisTeam[] {
  if (!maps.length) return [];
  const lines = aggregateGc(maps);
  const nameOf = (l: GcLine) => (l.userId && opts.names?.[l.userId]) || l.nick;
  const all = lines.filter((l) => l.rating != null);
  const best = (pick: (l: GcLine) => number, pool = all) =>
    pool.reduce<GcLine | null>((b, l) => (b == null || pick(l) > pick(b) ? l : b), null);
  const topRating = best((l) => l.rating ?? 0);
  const topFlash = best((l) => l.utility.flashed);
  const topEntries = best((l) => l.entries.duels);
  const multiMap = maps.length > 1;

  const paragraph = (l: GcLine, team: GcLine[]): AnalysisParagraph => {
    const facts: string[] = [];
    let tip: string | null = null;
    const r = l.rating ?? 0;
    const e = l.entries;
    const teamEntries = team.filter((t) => t.entries.duels >= 5);
    const worstEntry = teamEntries.reduce<GcLine | null>(
      (w, t) => (w == null || pct(t.entries.won, t.entries.duels) < pct(w.entries.won, w.entries.duels) ? t : w),
      null,
    );
    const bestEntryMate = team
      .filter((t) => t.key !== l.key && t.entries.duels >= 5)
      .reduce<GcLine | null>((b, t) => (b == null || t.entries.won > b.entries.won ? t : b), null);
    const series = perMap(maps, l, opts.mapName);

    // 1) Rating: o melhor da série, ou a variação entre os mapas.
    if (topRating?.key === l.key) facts.push(`Melhor rating da série (${dec(r)})`);
    if (multiMap && series.length > 1) {
      const lo = series.reduce((a, b) => (b.rating < a.rating ? b : a));
      const hi = series.reduce((a, b) => (b.rating > a.rating ? b : a));
      if (hi.rating - lo.rating >= 0.4)
        facts.push(`o rating foi de ${dec(lo.rating)} no ${lo.map} para ${dec(hi.rating)} no ${hi.map}`);
      else if (topRating?.key !== l.key && hi.rating >= 1.15)
        facts.push(`melhor mapa no ${hi.map} (${dec(hi.rating)})`);
    }
    if (!facts.length) facts.push(`rating de ${dec(r)} na série`);

    // 2) Aberturas.
    if (e.duels >= 5) {
      const rate = pct(e.won, e.duels);
      if (topEntries?.key === l.key)
        facts.push(`foi quem mais abriu round: ${e.duels} duelos de abertura, ${e.won} vencidos`);
      else if (worstEntry?.key === l.key && rate <= 40)
        facts.push(`venceu só ${e.won} de ${e.duels} duelos de abertura, o pior aproveitamento do time`);
      else if (rate >= 65) facts.push(`venceu ${e.won} de ${e.duels} duelos de abertura`);
    }

    // 3) Trades, utilitária, KAST, clutch.
    if (l.trades.traded >= 8 && topEntries?.key === l.key)
      facts.push(`${l.trades.traded} das mortes dele foram trocadas pelo time`);
    else if (l.trades.made >= 15) facts.push(`${l.trades.made} trades feitos`);
    if (topFlash?.key === l.key && l.utility.flashed >= 15)
      facts.push(`${l.utility.flashed} inimigos cegados, o maior número da série`);
    if ((l.kast ?? 0) >= 80) facts.push(`KAST de ${Math.round(l.kast!)}%`);
    const c = l.clutch;
    if (c.won >= 2)
      facts.push(`${c.won} de ${c.situations} clutches${c.biggest && c.biggest >= 2 ? ` (um 1v${c.biggest})` : ""}`);
    else if (c.situations >= 4 && c.won === 0) facts.push(`0 de ${c.situations} em clutch`);
    if ((l.multi[4] ?? 0) > 0) facts.push(`fez ${l.multi[4] === 1 ? "um ace" : `${l.multi[4]} aces`}`);
    const awp = series.find((s) => s.weapon === "AWP");
    if (awp) facts.push(multiMap ? `jogou de AWP no ${awp.map}` : "jogou de AWP");

    // Dica: a primeira regra que vale.
    const rate = pct(e.won, e.duels);
    if (e.duels >= 8 && rate <= 40 && bestEntryMate && bestEntryMate.entries.won > e.won)
      tip = `Vale deixar a primeira entrada para o ${nameOf(bestEntryMate)} e entrar logo atrás dele, pronto para a troca.`;
    else if (awp && e.duels >= 5 && e.won * 2 <= e.duels)
      tip = "Para quem segura a AWP, abrir o round é o trabalho principal.";
    else if (topEntries?.key === l.key && l.trades.traded >= 8) tip = "Quando a troca sai, o papel de entry funciona.";
    else if (c.situations >= 4 && c.won === 0) tip = "Treinar situações de 1 contra 2.";
    else if ((l.hsRate ?? 100) < 25 && l.k >= 25)
      tip = "Mira mais alta: treino de headshot (DM só HS) ajuda a fechar duelo mais rápido.";
    else if (l.utility.flashed < 8 && l.utility.grenades < 25)
      tip = "Usar mais utilitária: uma flash antes de entrar vale mais que o duelo seco.";
    else if ((l.kast ?? 0) >= 80 && topFlash?.key === l.key) tip = "É o suporte que sustenta o time.";
    else if (r >= 1.15) tip = "Manter o papel: o time rende quando ele está no jogo.";

    const ai = opts.ai?.[l.key];
    if (ai)
      return {
        key: l.key,
        userId: l.userId,
        name: nameOf(l),
        facts: [],
        tip: ai.tip || null,
        text: ai.text,
        roast: ai.roast || undefined,
      };
    return { key: l.key, userId: l.userId, name: nameOf(l), facts: facts.slice(0, 4), tip };
  };

  return (["A", "B"] as const)
    .map((side) => {
      const team = lines.filter((l) => l.team === side);
      return {
        side,
        won: opts.winner ? opts.winner === side : null,
        players: [...team]
          .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || b.k - a.k)
          .map((l) => paragraph(l, team)),
      };
    })
    .filter((t) => t.players.length)
    .sort((a, b) => Number(b.won) - Number(a.won));
}

/** Junta os fatos numa frase: "A, B e C." (o primeiro com letra maiúscula). */
export function joinFacts(facts: string[]) {
  if (!facts.length) return "";
  const list = facts.length > 1 ? `${facts.slice(0, -1).join(", ")} e ${facts.at(-1)}` : facts[0]!;
  return `${list.charAt(0).toUpperCase()}${list.slice(1)}.`;
}

/* ------------------------------ Versão da IA ------------------------------ */

export interface SheetPlayer {
  /** Identificador curto para a IA ("j1"…). */
  id: string;
  key: string;
  name: string;
  team: "A" | "B";
  facts: string[];
  /** Dica das regras, como ponto de partida. */
  hint: string | null;
}

export interface AnalysisSheet {
  /** Resultado e mapas (números valem para todos). */
  context: string[];
  players: SheetPlayer[];
}

/** Ficha com os números de cada jogador, para a IA escrever a análise. */
export function analysisSheet(
  maps: GcMapStored[],
  opts: {
    winner: "A" | "B" | null;
    teams: { A: string; B: string };
    names?: Record<string, string>;
    mapName: (id: string) => string;
  },
): AnalysisSheet {
  if (!maps.length) return { context: [], players: [] };
  const lines = aggregateGc(maps);
  const rules = matchAnalysis(maps, { ...opts, ai: null });
  const hintOf = new Map(rules.flatMap((t) => t.players.map((p) => [p.key, p.tip] as const)));
  const nameOf = (l: GcLine) => (l.userId && opts.names?.[l.userId]) || l.nick;
  const top = (pick: (l: GcLine) => number, pool = lines) =>
    pool.reduce<GcLine | null>((b, l) => (b == null || pick(l) > pick(b) ? l : b), null)?.key;
  const topRating = top((l) => l.rating ?? -1);
  const topEntries = top((l) => l.entries.duels);
  const topFlash = top((l) => l.utility.flashed);
  const multiMap = maps.length > 1;

  const context = [
    opts.winner
      ? `${opts.teams[opts.winner]} venceu a série contra ${opts.teams[opts.winner === "A" ? "B" : "A"]}`
      : `${opts.teams.A} e ${opts.teams.B} empataram a série`,
    ...maps.map((m) => `${opts.mapName(m.mapId)}: ${opts.teams.A} ${m.scoreA} × ${m.scoreB} ${opts.teams.B}`),
  ];

  const order = (["A", "B"] as const).flatMap((side) =>
    lines.filter((l) => l.team === side).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || b.k - a.k),
  );
  const players = order.map((l, i): SheetPlayer => {
    const team = lines.filter((t) => t.team === l.team);
    const f: string[] = [
      `time ${opts.teams[l.team]}${opts.winner ? (opts.winner === l.team ? " (venceu)" : " (perdeu)") : ""}`,
    ];
    const teamRank = [...team].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)).findIndex((t) => t.key === l.key) + 1;
    if (l.rating != null)
      f.push(
        `rating ${dec(l.rating)} na série${topRating === l.key ? " (o melhor da partida)" : teamRank === 1 ? " (o melhor do time)" : teamRank === team.length ? " (o menor do time)" : ""}`,
      );
    if (multiMap)
      for (const s of perMap(maps, l, opts.mapName))
        f.push(`rating ${dec(s.rating)} no ${s.map}${s.weapon ? `, arma principal ${s.weapon}` : ""}`);
    else if (l.aim.mainWeapon) f.push(`arma principal ${l.aim.mainWeapon}`);
    f.push(`${l.k} kills, ${l.a} assistências e ${l.d} mortes`);
    if (l.adr != null) f.push(`ADR ${Math.round(l.adr)}`);
    if (l.kast != null) f.push(`KAST ${Math.round(l.kast)}%`);
    if (l.hsRate != null) f.push(`${Math.round(l.hsRate)}% das kills com headshot`);
    const e = l.entries;
    if (e.duels) {
      const withFive = team.filter((t) => t.entries.duels >= 5);
      const rate = (t: GcLine) => t.entries.won / t.entries.duels;
      const tag =
        topEntries === l.key
          ? " (quem mais abriu round na partida)"
          : e.duels >= 5 && withFive.length > 1 && withFive.every((t) => rate(t) >= rate(l))
            ? " (o pior aproveitamento de abertura do time)"
            : e.duels >= 5 && withFive.length > 1 && withFive.every((t) => rate(t) <= rate(l))
              ? " (o melhor aproveitamento de abertura do time)"
              : "";
      f.push(`venceu ${e.won} de ${e.duels} duelos de abertura (${pct(e.won, e.duels)}%)${tag}`);
    }
    f.push(`${l.trades.made} trades feitos; ${l.trades.traded} mortes dele foram trocadas pelo time`);
    if (l.clutch.situations)
      f.push(
        `venceu ${l.clutch.won} de ${l.clutch.situations} clutches${l.clutch.biggest ? ` (o maior foi um 1v${l.clutch.biggest})` : ""}`,
      );
    f.push(
      `${l.utility.flashed} inimigos cegados${topFlash === l.key ? " (o maior número da partida)" : ""}, ${l.utility.damage} de dano com granada em ${l.utility.grenades} granadas`,
    );
    if (l.multi[3]) f.push(`${l.multi[3]} ${l.multi[3] === 1 ? "round" : "rounds"} com 4 kills`);
    if (l.multi[4]) f.push(`${l.multi[4] === 1 ? "um ace" : `${l.multi[4]} aces`}`);
    return { id: `j${i + 1}`, key: l.key, name: nameOf(l), team: l.team, facts: f, hint: hintOf.get(l.key) ?? null };
  });
  return { context, players };
}

const numbersIn = (text: string) => (text.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => Number(n.replace(",", ".")));
const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/**
 * Valida o texto da IA: cada jogador só pode citar números da própria ficha,
 * das fichas do próprio time ou do placar (até 5 vale por extenso). Null se
 * menos da metade dos jogadores tiver um texto aceito.
 */
export function checkAiAnalysis(raw: unknown, sheet: AnalysisSheet): AiAnalysis | null {
  const list = raw && typeof raw === "object" ? (raw as { players?: unknown }).players : null;
  if (!Array.isArray(list) || !sheet.players.length) return null;
  const byId = new Map(sheet.players.map((p) => [p.id, p]));
  const out: AiAnalysis = {};
  for (const item of list) {
    const r = (item ?? {}) as Record<string, unknown>;
    const p = byId.get(clean(r.id, 8));
    const text = clean(r.text, 600);
    const tip = clean(r.tip, 220);
    const roast = clean(r.roast, 320);
    if (!p || !text || out[p.key]) continue;
    const allowed = new Set(
      numbersIn(
        [...sheet.context, ...sheet.players.filter((x) => x.team === p.team).flatMap((x) => x.facts)].join(" "),
      ),
    );
    // Decimais (rating) sempre conferidos; inteiros até 5 passam ("dois clutches", "1v2").
    if (numbersIn(`${text} ${tip} ${roast}`).some((n) => (n > 5 || !Number.isInteger(n)) && !allowed.has(n))) continue;
    out[p.key] = roast ? { text, tip, roast } : { text, tip };
  }
  return Object.keys(out).length * 2 >= sheet.players.length ? out : null;
}
