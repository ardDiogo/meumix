/**
 * Análise da partida, jogador por jogador (página do mix), com os dados
 * importados da GC: dois ou três fatos com números e uma dica prática.
 * Montada por regras, sem IA: só usa números que estão nos dados.
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
}

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
  opts: { winner: "A" | "B" | null; names?: Record<string, string>; mapName: (id: string) => string },
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
