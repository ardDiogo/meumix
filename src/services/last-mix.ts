import "server-only";
import { aggregateGc, gcHighlights } from "@/lib/gc-analysis";
import { byMixScore, kdrOf, matchHighlights, mixScore, type StatRow } from "@/lib/match-highlights";
import { mapName } from "@/lib/maps";
import { mixHref } from "@/lib/mix-slug";
import { overall } from "@/lib/performance";
import { seriesScore, seriesWinner } from "@/lib/stats";
import type { TeamSide } from "@/types/domain";
import { getDataSource } from "@/services";
import { getCurrentLeague } from "./league";
import { getGcMaps } from "./gc-maps";
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
    const debuts = rows.filter((r) => r.userId && !averages[r.userId]).map((r) => r.name);

    const mine = viewerId ? rows.find((r) => r.userId === viewerId) : undefined;
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
        .slice(0, 2),
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
          }
        : null,
    };
  } catch (e) {
    console.error("[last-mix]", e);
    return null;
  }
}
