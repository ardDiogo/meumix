import "server-only";
import { aggregateGc, gcHighlights } from "@/lib/gc-analysis";
import { byMixScore, kdrOf, matchHighlights, mixScore, type StatRow } from "@/lib/match-highlights";
import { mapName } from "@/lib/maps";
import { mixHref } from "@/lib/mix-slug";
import { overall, statOf } from "@/lib/performance";
import { seriesScore, seriesWinner } from "@/lib/stats";
import type { TeamSide } from "@/types/domain";
import { getDataSource } from "@/services";
import { getCurrentLeague } from "./league";
import { getGcMaps } from "./gc-maps";
import { playerBadges } from "./badges";
import { getAnalysis } from "./match-analysis";
import { getMatchReport, playerAverages } from "./match-report";

export interface LastMixPerson {
  name: string;
  avatarUrl: string | null;
  team: TeamSide;
}

/** Tudo o que o carrossel do Dashboard mostra sobre o último mix (dados já gravados). */
export interface LastMixSummary {
  href: string;
  name: string;
  /** "2026-11-24" */
  date: string;
  league: string | null;
  teams: { side: TeamSide; name: string; players: LastMixPerson[] }[];
  score: [number, number] | null;
  winner: TeamSide | null;
  maps: { mapId: string; name: string; a: number | null; b: number | null; rounds: TeamSide[] }[];
  mvp: (LastMixPerson & { line: string; badge: string }) | null;
  lanterna: (LastMixPerson & { line: string; badge: string }) | null;
  highlights: (LastMixPerson & { label: string; detail: string; tone: string })[];
  roasts: (LastMixPerson & { text: string })[];
  /** Comparado com a própria média (%, Geral: KDR, ADR, FK e KAST). */
  above: (LastMixPerson & { value: number })[];
  below: (LastMixPerson & { value: number })[];
  debuts: string[];
  me: {
    person: LastMixPerson;
    position: number;
    total: number;
    k: number;
    a: number;
    d: number;
    adr: number | null;
    pts: number;
    eloDelta: number | null;
    eloAfter: number | null;
    isMvp: boolean;
    isLanterna: boolean;
    roast: string | null;
    tip: string | null;
    /** Resultado do time do jogador e o placar do ponto de vista dele. */
    result: "win" | "loss" | "draw";
    teamName: string;
    ownScore: [number, number] | null;
    kdr: number;
    fk: number;
    kast: number | null;
    /** Dados da GC (mix importado da GC). */
    hsRate: number | null;
    rating: number | null;
    /** "Seu jogo no mix" (dados da GC): cada área com a posição no lobby; sem GC, null. */
    game: {
      role: { emoji: string; label: string };
      items: { key: string; emoji: string; label: string; value: string; detail: string; rank: number }[];
    } | null;
    /** Seu número em cada mapa (GC; sem GC, null em todos) e o índice do melhor mapa. */
    mapLines: ({ k: number; d: number; kdr: number; rating: number | null } | null)[];
    bestMap: number | null;
    /** Insígnias conquistadas neste mix. */
    badges: { id: string; name: string; icon: string; color: string; reason: string | null }[];
    /** ELO nos últimos mixes (do mais antigo ao atual), para o mini gráfico. */
    eloTrend: number[];
    /** Comparado com a própria média (Geral e cada estatística, em %); estreia: null. */
    perf: { value: number; parts: { stat: string; label: string; pct: number; now: string; avg: string }[] } | null;
  } | null;
}

const dec = (n: number, d = 2) => n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);
const person = (r: StatRow): LastMixPerson => ({ name: r.name, avatarUrl: r.avatarUrl, team: r.team });

/** Último mix finalizado da liga escolhida no topo. Sem mix (ou sem estatísticas): null. */
export async function getLastMixSummary(viewerId: string | null): Promise<LastMixSummary | null> {
  try {
    const ds = getDataSource();
    if (ds.kind !== "supabase") return null;
    const mixes = (await ds.listMixes()).filter((m) => m.status === "finished");
    const mix = [...mixes].sort((x, y) => y.scheduledAt.localeCompare(x.scheduledAt))[0];
    if (!mix) return null;
    const [report, gcMaps, analysis, league] = await Promise.all([
      getMatchReport(mix.id),
      getGcMaps(mix.id),
      getAnalysis(mix.id),
      getCurrentLeague(),
    ]);
    const rows = report?.rows ?? [];
    if (!rows.length) return null;
    const ordered = [...rows].sort(byMixScore);

    // Destaques: MVP e lanterna à parte; os outros da planilha + quem mais cegou (GC).
    const list = matchHighlights(rows);
    const pick = (key: string) => list.find((h) => h.key === key)?.row;
    const mvpRow = pick("mvp");
    const worstRow = pick("worst");
    const lines = gcMaps.length ? aggregateGc(gcMaps) : [];
    const flash = gcHighlights(lines).find((h) => h.key === "flash")?.line;
    const flashRow = flash ? rows.find((r) => (r.userId ? r.userId === flash.userId : r.name === flash.nick)) : null;
    const highlights: LastMixSummary["highlights"] = [];
    const add = (key: string, label: string, tone: string, detail: (r: StatRow) => string) => {
      const r = pick(key);
      if (r) highlights.push({ ...person(r), label, tone, detail: detail(r) });
    };
    add("kills", "Maior matador", "text-orange-400", (r) => `${r.k} kills`);
    add("adr", "Maior ADR", "text-brand", (r) => `${dec(r.adr ?? 0, 1)} ADR`);
    add("kdr", "Maior KDR", "text-win", (r) => `${dec(kdrOf(r))} KDR`);
    add("fk", "Mais first kills", "text-cyan-400", (r) => `${r.fk} FK`);
    add("assists", "Mais assistências", "text-sky-400", (r) => `${r.a} assists`);
    if (flash && flashRow)
      highlights.push({
        ...person(flashRow),
        label: "Mais cegados",
        tone: "text-yellow-400",
        detail: `${flash.utility.flashed} cegos`,
      });

    const eloText = (r: StatRow) => (r.eloDelta != null ? ` · ${signed(r.eloDelta)} ELO` : "");

    // Resenhas da IA (a frase de zoeira de cada um).
    const roastOf = (r: StatRow) => (r.userId ? analysis?.content[r.userId] : undefined) ?? analysis?.content[r.key];
    const roasts = ordered.flatMap((r) => {
      const text = roastOf(r)?.roast?.trim();
      return text ? [{ ...person(r), text }] : [];
    });

    // Quem superou a si mesmo (média de cada um nos outros mixes).
    const averages = await playerAverages(
      mix.id,
      rows.map((r) => r.userId).filter((id): id is string => !!id),
    ).catch(() => ({}) as Record<string, never>);
    const perf = rows.flatMap((r) => {
      const o = r.userId ? overall(r, averages[r.userId]) : null;
      return o ? [{ ...person(r), value: Math.round(o.value) }] : [];
    });
    const sorted = [...perf].sort((x, y) => y.value - x.value);
    const STAT_LABEL: Record<string, string> = { kdr: "KDR", adr: "ADR", fk: "FK", kast: "KAST" };
    const myPerf = (r: StatRow) => {
      const avg = r.userId ? averages[r.userId] : undefined;
      const o = r.userId ? overall(r, avg) : null;
      if (!o || !avg) return null;
      const fmt = (k: string, v: number | null) =>
        v == null
          ? "—"
          : k === "kast"
            ? `${Math.round(v)}%`
            : k === "fk"
              ? dec(v, 1)
              : k === "adr"
                ? dec(v, 1)
                : dec(v);
      return {
        value: Math.round(o.value),
        parts: o.parts.map((p) => ({
          stat: p.k,
          label: STAT_LABEL[p.k] ?? p.k,
          pct: Math.round(p.pct),
          now: fmt(p.k, statOf(r, p.k)),
          avg: fmt(p.k, avg[p.k] ?? null),
        })),
      };
    };
    const debuts = rows.filter((r) => r.userId && !averages[r.userId]).map((r) => r.name);

    const mine = viewerId ? rows.find((r) => r.userId === viewerId) : undefined;
    const myLine = mine ? lines.find((l) => l.userId === mine.userId) : undefined;
    const score = seriesScore(mix);
    // Seu jogo no mix: aberturas, trades, clutch e utilitária, com a posição entre os 10.
    const myGame = () => {
      if (!myLine || lines.length < 2) return null;
      const rank = (f: (l: (typeof lines)[number]) => number) => 1 + lines.filter((l) => f(l) > f(myLine)).length;
      const items = [
        {
          key: "entry",
          emoji: "🚪",
          label: "Aberturas",
          value: `${myLine.entries.won}/${myLine.entries.duels}`,
          detail: myLine.entries.duels ? `${Math.round((myLine.entries.won / myLine.entries.duels) * 100)}%` : "—",
          rank: rank((l) => l.entries.duels * 1000 + l.entries.won),
        },
        {
          key: "trade",
          emoji: "🔁",
          label: "Trades",
          value: String(myLine.trades.made),
          detail: `${myLine.trades.traded} suas trocadas`,
          rank: rank((l) => l.trades.made),
        },
        {
          key: "clutch",
          emoji: "🎯",
          label: "Clutch",
          value: `${myLine.clutch.won}/${myLine.clutch.situations}`,
          detail: myLine.clutch.biggest ? `maior 1v${myLine.clutch.biggest}` : "—",
          rank: rank((l) => l.clutch.won * 1000 + (l.clutch.biggest ?? 0)),
        },
        {
          key: "util",
          emoji: "💥",
          label: "Utilitária",
          value: `${myLine.utility.flashed} cegos`,
          detail: `${myLine.utility.damage} dano`,
          rank: rank((l) => l.utility.flashed * 10000 + l.utility.damage),
        },
      ];
      const ROLE: Record<string, { emoji: string; label: string }> = {
        entry: { emoji: "🚪", label: "Abridor de rounds" },
        trade: { emoji: "🔁", label: "Cobertura do time" },
        clutch: { emoji: "🎯", label: "Clutcher" },
        util: { emoji: "💥", label: "Rei da utilitária" },
      };
      const best = items.reduce((a, b) => (b.rank < a.rank ? b : a));
      return { role: ROLE[best.key]!, items };
    };
    // Seu número em cada mapa (GC), casando pelo mapa e, na falta, pela ordem.
    const mapLines = mix.maps.map((m, i) => {
      const g = gcMaps.find((x) => x.mapId === m.mapId) ?? gcMaps[i];
      const l = mine && g ? aggregateGc([g]).find((x) => x.userId === mine.userId) : undefined;
      return l ? { k: l.k, d: l.d, kdr: l.k / Math.max(l.d, 1), rating: l.rating } : null;
    });
    const scored = mapLines.flatMap((l, i) => (l ? [{ i, v: l.rating ?? l.kdr }] : []));
    const bestMap = scored.length > 1 ? scored.reduce((a, b) => (b.v > a.v ? b : a)).i : null;
    // Insígnias do mix (as automáticas começam no dia do mix) e o ELO dos últimos mixes.
    const [myBadges, history] = mine?.userId
      ? await Promise.all([
          playerBadges([mine.userId], { history: true }).catch(() => []),
          ds.getEloHistory(mine.userId).catch(() => []),
        ])
      : [[], []];
    const date0 = mix.scheduledAt.slice(0, 10);
    const badges = myBadges
      .filter((b) => b.createdAt.slice(0, 10) === date0)
      .sort((a, b) => a.priority - b.priority)
      .slice(0, 3)
      .map((b) => ({ id: b.id, name: b.name, icon: b.icon, color: b.color, reason: b.reason }));
    const upTo = history.findIndex((h) => h.mixId === mix.id);
    const recent = (upTo >= 0 ? history.slice(0, upTo + 1) : history).slice(-10);
    const eloTrend = recent.length > 1 ? [recent[0]!.eloBefore, ...recent.map((h) => h.eloAfter)] : [];
    const winnerSide = seriesWinner(mix);
    const date = mix.scheduledAt.slice(0, 10);
    const roundsOf = (i: number) => (gcMaps[i]?.rounds ?? []).map((x) => x.w);
    return {
      href: mixHref(mix),
      name: mix.name,
      date,
      league: league && !league.none ? league.name : null,
      teams: mix.teams.map((t) => ({
        side: t.side,
        name: t.name,
        players: ordered.filter((r) => r.team === t.side).map(person),
      })),
      score: seriesScore(mix),
      winner: seriesWinner(mix),
      maps: mix.maps.map((m, i) => ({
        mapId: m.mapId,
        name: mapName(m.mapId),
        a: m.scoreA,
        b: m.scoreB,
        rounds: roundsOf(i),
      })),
      mvp: mvpRow
        ? {
            ...person(mvpRow),
            line: `${mvpRow.k}K · ${mvpRow.a}A · ${mvpRow.d}D`,
            badge: `${dec(kdrOf(mvpRow))} KDR${eloText(mvpRow)}`,
          }
        : null,
      lanterna: worstRow
        ? {
            ...person(worstRow),
            line: `${worstRow.k}K · ${worstRow.a}A · ${worstRow.d}D`,
            badge: `${dec(kdrOf(worstRow))} KDR${eloText(worstRow)}`,
          }
        : null,
      highlights,
      roasts,
      above: sorted.filter((p) => p.value > 0).slice(0, 3),
      below: sorted
        .filter((p) => p.value < 0)
        .reverse()
        .slice(0, 3),
      debuts,
      me: mine
        ? {
            person: person(mine),
            position: ordered.indexOf(mine) + 1,
            total: ordered.length,
            k: mine.k,
            a: mine.a,
            d: mine.d,
            adr: mine.adr,
            pts: Math.round(mixScore(mine)),
            eloDelta: mine.eloDelta ?? null,
            eloAfter: mine.elo,
            isMvp: mine.isMvp,
            isLanterna: mine.isLanterna,
            roast: roastOf(mine)?.roast?.trim() || null,
            tip: roastOf(mine)?.tip?.trim() || null,
            perf: myPerf(mine),
            mapLines,
            bestMap,
            badges,
            eloTrend,
            game: myGame(),
            result: !winnerSide ? "draw" : winnerSide === mine.team ? "win" : "loss",
            teamName: mix.teams.find((t) => t.side === mine.team)?.name ?? "",
            ownScore: score ? (mine.team === "A" ? score : [score[1], score[0]]) : null,
            kdr: kdrOf(mine),
            fk: mine.fk,
            kast: mine.kast,
            hsRate: myLine?.hsRate ?? null,
            rating: myLine?.rating ?? null,
          }
        : null,
    };
  } catch (e) {
    console.error("[last-mix]", e);
    return null;
  }
}
