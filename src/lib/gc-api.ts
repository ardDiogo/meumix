/**
 * Importação da partida pela própria página da GC (docs/importar-da-gc.md).
 * O botão "Enviar ao MeuMix" roda na aba da GC, logado, e manda as respostas
 * de `/api/lobby/match/{id}/stats`, `/lobby/match/{id}/1` (resultado: RP,
 * mapa, nick e SteamID) e `/api/allstar/highlights/lobby/{id}` sem mexer;
 * aqui elas são conferidas e convertidas. Funções puras.
 */
import type { OcrMap, OcrPlayer } from "./gc-ocr";

/** O que o botão manda (cru, do jeito que a GC respondeu). */
export interface GcPayload {
  v: 1;
  /** Número da partida na GC (o do link). */
  id: string;
  stats: unknown;
  /** Resultado da partida (`/lobby/match/{id}/1`). */
  result?: unknown;
  highlights: unknown;
  /** Nomes de mapa encontrados no texto da página (pista para o mapa). */
  pageMaps?: string[];
}

export interface GcPlayer {
  gcId: string;
  nick: string;
  /** SteamID64 (liga ao jogador com a Steam vinculada; não fica salvo). */
  steamId?: string | null;
  /** Pontos de ranking da GC no mapa (é o que muda o ELO do MeuMix); null se não veio. */
  rp: number | null;
  /** Time na GC (A/B da própria GC, não o do MeuMix). */
  team: "A" | "B";
  k: number;
  a: number;
  d: number;
  adr: number | null;
  kast: number | null;
  fk: number;
  mk: number;
  fa: number;
  hs: number;
  hsRate: number | null;
  plants: number;
  defuses: number;
  /** Rounds com 1, 2, 3, 4 e 5 kills. */
  multi: number[];
  rating: number | null;
  swing: number | null;
  entries: { duels: number; won: number; lost: number };
  trades: { made: number; traded: number; avgTime: number | null };
  clutch: {
    situations: number;
    won: number;
    v1Won: number;
    v1Total: number;
    vnWon: number;
    vnTotal: number;
    /** Maior virada vencida (2 = 1v2). */
    biggest: number | null;
  };
  utility: { damage: number; flashed: number; grenades: number };
  aim: { accuracy: number | null; headAccuracy: number | null; mainWeapon: string | null };
}

export interface GcRound {
  winner: "A" | "B";
  reason: string;
  /** Lado do time A da GC no round. */
  aSide: "CT" | "T";
}

export interface GcClip {
  gcId: string;
  clipId: string;
  title: string;
}

export interface GcMap {
  gcMatchId: string;
  /** Nome do mapa deduzido (título do clipe ou texto da página); o admin confirma. */
  mapHint: string | null;
  scoreA: number;
  scoreB: number;
  rounds: GcRound[];
  players: GcPlayer[];
  clips: GcClip[];
}

const KNOWN_MAPS = [
  "Mirage",
  "Inferno",
  "Dust2",
  "Dust 2",
  "Nuke",
  "Ancient",
  "Anubis",
  "Train",
  "Overpass",
  "Vertigo",
  "Cache",
];

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const int = (v: unknown) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 0 ? n : 0;
};
const num = (v: unknown, digits = 2) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};
const text = (v: unknown, max = 80) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Nicks por ID da GC, a partir dos destaques da partida. */
export function nicksFromHighlights(raw: unknown): Record<string, string> {
  const list = obj(raw).highlights;
  const out: Record<string, string> = {};
  for (const h of Array.isArray(list) ? list : []) {
    const p = obj(obj(h).player);
    const id = String(p.id ?? "");
    const nick = text(p.nick, 64);
    if (/^\d{1,12}$/.test(id) && nick) out[id] = nick;
  }
  return out;
}

/** Clipes prontos do Allstar (só os já processados, com link). */
function clipsFromHighlights(raw: unknown): GcClip[] {
  const list = obj(raw).highlights;
  return (Array.isArray(list) ? list : []).flatMap((h) => {
    const x = obj(h);
    const url = typeof x.clipUrl === "string" ? x.clipUrl : "";
    const clipId = /[?&]clip=([A-Za-z0-9_-]{6,64})/.exec(url)?.[1];
    const gcId = String(obj(x.player).id ?? "");
    const title = text(x.clipTitle, 80);
    return x.status === "processed" && clipId && /^\d{1,12}$/.test(gcId) && title ? [{ gcId, clipId, title }] : [];
  });
}

/** Do resultado da partida: RP, nick e SteamID de cada ID da GC, e o mapa. */
function fromResult(raw: unknown) {
  const jogos = obj(obj(raw).jogos);
  const teams = obj(jogos.players);
  const byId: Record<string, { rp: number | null; nick: string; steamId: string | null }> = {};
  for (const list of [teams.team_a, teams.team_b])
    for (const x of Array.isArray(list) ? list : []) {
      const row = obj(x);
      const player = obj(row.player);
      const id = String(row.idplayer ?? player.id ?? "");
      if (!/^\d{1,12}$/.test(id)) continue;
      const rp = Number(row.rating_points);
      const steam = String(player.plSteamID64 ?? "");
      byId[id] = {
        rp: row.rating_points != null && row.rating_points !== "" && Number.isFinite(rp) ? Math.round(rp) : null,
        nick: text(player.nick, 64),
        steamId: /^7656119\d{10}$/.test(steam) ? steam : null,
      };
    }
  const map = text(jogos.map_name, 32);
  return { byId, map: /^de_[a-z0-9_]+$/.test(map) ? map : null };
}

/** Nome para mostrar: "de_mirage" → "Mirage". */
export const prettyMap = (hint: string | null) =>
  hint ? hint.replace(/^de_/, "").replace(/^./, (c) => c.toUpperCase()) : null;

/** Primeiro nome de mapa conhecido num texto. */
export function findMapName(s: string | null | undefined) {
  if (!s) return null;
  const hit = KNOWN_MAPS.map((m) => ({ m, i: s.toLowerCase().indexOf(m.toLowerCase()) }))
    .filter((x) => x.i >= 0)
    .sort((a, b) => a.i - b.i)[0];
  return hit ? hit.m.replace(" ", "") : null;
}

export type GcParseResult = { ok: true; map: GcMap } | { ok: false; message: string };

/** Confere e converte o que o botão mandou (ou o JSON colado da `stats`). */
export function parseGcPayload(raw: unknown): GcParseResult {
  const p = obj(raw);
  // JSON colado direto da `stats` também vale (sem destaques: nicks ficam pelo ID).
  const stats = obj("scoreboard" in p ? p : p.stats);
  const highlights = "scoreboard" in p ? null : p.highlights;
  const gcMatchId = String(p.id ?? "")
    .replace(/\D/g, "")
    .slice(0, 12);

  if (stats.status !== undefined && stats.status !== "pronto")
    return {
      ok: false,
      message: "A GC ainda está processando as estatísticas desta partida. Tente em alguns minutos.",
    };
  const scoreboard = obj(stats.scoreboard);
  const players = obj(stats.players);
  const ids = Object.keys(scoreboard).filter((id) => /^\d{1,12}$/.test(id));
  if (ids.length < 2 || ids.length > 12)
    return { ok: false, message: "Isso não parece a resposta de estatísticas da GC (faltam os jogadores)." };

  const nicks = nicksFromHighlights(highlights);
  const result = fromResult("scoreboard" in p ? null : p.result);
  const list: GcPlayer[] = ids.map((gcId) => {
    const s = obj(scoreboard[gcId]);
    const pl = obj(players[gcId]);
    const row = obj(pl.row);
    const general = obj(row.general);
    const entries = obj(row.entries);
    const trades = obj(row.trades);
    const clutch = obj(row.clutch);
    const utility = obj(row.utility);
    const aim = obj(row.aim);
    const multi = Array.isArray(s.roundsWithKills) ? s.roundsWithKills.slice(0, 5).map(int) : [];
    return {
      gcId,
      nick: result.byId[gcId]?.nick || nicks[gcId] || `GC ${gcId}`,
      steamId: result.byId[gcId]?.steamId ?? null,
      rp: result.byId[gcId]?.rp ?? null,
      team: pl.team === "B" ? "B" : "A",
      k: int(s.kills),
      a: int(s.assists),
      d: int(s.deaths),
      adr: num(s.adr),
      kast: num(s.kast, 1),
      fk: int(s.firstKills),
      mk: int(s.multiKills),
      fa: int(s.flashAssists),
      hs: int(s.headshots),
      hsRate: num(s.headshotRate, 1),
      plants: int(s.plants),
      defuses: int(s.defuses),
      multi,
      rating: num(general.rating),
      swing: num(general.roundSwing, 4),
      entries: { duels: int(entries.duels), won: int(entries.won), lost: int(entries.lost) },
      trades: { made: int(trades.made), traded: int(trades.tradedDeaths), avgTime: num(trades.avgTime) },
      clutch: {
        situations: int(clutch.situations),
        won: int(clutch.won),
        v1Won: int(clutch.oneVsOneWon),
        v1Total: int(clutch.oneVsOneTotal),
        vnWon: int(clutch.oneVsManyWon),
        vnTotal: int(clutch.oneVsManyTotal),
        biggest: clutch.biggestComeback == null ? null : int(clutch.biggestComeback),
      },
      utility: { damage: int(utility.damage), flashed: int(utility.enemiesFlashed), grenades: int(utility.grenades) },
      aim: {
        accuracy: num(aim.accuracy, 1),
        headAccuracy: num(aim.headAccuracy, 1),
        mainWeapon: text(aim.mainWeapon, 24) || null,
      },
    };
  });
  if (!list.some((x) => x.team === "B") || !list.some((x) => x.team === "A"))
    return { ok: false, message: "Não consegui separar os dois times desta partida." };

  const rounds: GcRound[] = (Array.isArray(stats.rounds) ? stats.rounds : []).slice(0, 60).map((r) => {
    const x = obj(r);
    return {
      winner: x.winnerTeam === "B" ? "B" : "A",
      reason: text(x.endReason, 24),
      aSide: x.teamASide === "T" ? "T" : "CT",
    };
  });
  const last = obj(Array.isArray(stats.rounds) ? stats.rounds.at(-1) : null);
  // Placar: o do último round; sem rounds, conta as vitórias.
  const scoreA = last.scoreA != null ? int(last.scoreA) : rounds.filter((r) => r.winner === "A").length;
  const scoreB = last.scoreB != null ? int(last.scoreB) : rounds.filter((r) => r.winner === "B").length;

  const clips = clipsFromHighlights(highlights);
  const mapHint =
    result.map ??
    findMapName(clips.map((c) => c.title).join(" ")) ??
    (Array.isArray(p.pageMaps) && p.pageMaps.length === 1 ? findMapName(String(p.pageMaps[0])) : null);

  return { ok: true, map: { gcMatchId, mapHint, scoreA, scoreB, rounds, players: list, clips } };
}

/** Mapa da GC no formato da leitura de prints (para somar os mapas como sempre). */
export function toOcrMap(m: GcMap, mapName: string | null): OcrMap {
  const team = (t: "A" | "B") => ({
    name: null,
    score: t === "A" ? m.scoreA : m.scoreB,
    players: m.players
      .filter((p) => p.team === t)
      .map((p): OcrPlayer => ({
        nick: p.nick,
        k: p.k,
        a: p.a,
        d: p.d,
        diff: p.k - p.d,
        adr: p.adr,
        kdr: Math.round((p.k / Math.max(p.d, 1)) * 100) / 100,
        kast: p.kast,
        // A GC não traz S nem DROP.
        s: 0,
        fa: p.fa,
        mk: p.mk,
        fk: p.fk,
        rp: p.rp ?? 0,
        drop: 0,
      })),
  });
  return { mapName, teams: [team("A"), team("B")] };
}

/** Chave do apelido que liga um ID da GC a um jogador (tabela player_aliases). */
export const gcAlias = (gcId: string) => `gc:${gcId}`;

/** O que fica salvo de cada mapa (times já no lado do MeuMix). */
export interface GcMapStored {
  gcMatchId: string;
  mapId: string;
  scoreA: number;
  scoreB: number;
  rounds: { w: "A" | "B"; r: string; ct: "A" | "B" }[];
  players: (Omit<GcPlayer, "team" | "steamId"> & { team: "A" | "B"; userId: string | null })[];
  clips: GcClip[];
}

/**
 * Converte para o lado do MeuMix: `flip` quando o time A da GC é o time B do
 * mix. `userOf` liga o ID da GC ao jogador (ou null, convidado).
 */
export function storeGcMap(
  m: GcMap,
  mapId: string,
  flip: boolean,
  userOf: (gcId: string) => string | null,
): GcMapStored {
  const side = (t: "A" | "B"): "A" | "B" => (flip ? (t === "A" ? "B" : "A") : t);
  return {
    gcMatchId: m.gcMatchId,
    mapId,
    scoreA: flip ? m.scoreB : m.scoreA,
    scoreB: flip ? m.scoreA : m.scoreB,
    rounds: m.rounds.map((r) => ({
      w: side(r.winner),
      r: r.reason,
      ct: r.aSide === "CT" ? side("A") : side("B"),
    })),
    // O SteamID só serve para ligar o jogador: não fica salvo.
    players: m.players.map((p) => {
      const out = { ...p, team: side(p.team), userId: userOf(p.gcId) };
      delete out.steamId;
      return out;
    }),
    clips: m.clips,
  };
}
