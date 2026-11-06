/**
 * Partida da GC no campeonato: confere o mapa que vem do navegador (fila do
 * "Enviar ao MeuMix" ou JSON colado) e descobre qual lado da GC é o mandante.
 * Funções puras (testes: `npm run test:campeonato`).
 */
import type { GcMap, GcPlayer } from "./gc-api";

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const int = (v: unknown, max = 100000) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : 0;
};
const num = (v: unknown) =>
  v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v);
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const side = (v: unknown): "A" | "B" | null => (v === "A" || v === "B" ? v : null);

/**
 * Remonta o mapa só com os campos conhecidos (o que vem do navegador não é
 * confiável). Null se faltar o essencial.
 */
export function sanitizeGcMap(raw: unknown): GcMap | null {
  const m = obj(raw);
  const gcMatchId = String(m.gcMatchId ?? "");
  if (!/^\d{1,12}$/.test(gcMatchId)) return null;
  const list = Array.isArray(m.players) ? m.players.slice(0, 12) : [];
  const players: GcPlayer[] = [];
  for (const x of list) {
    const p = obj(x);
    const team = side(p.team);
    const gcId = String(p.gcId ?? "");
    if (!team || !/^\d{1,12}$/.test(gcId)) return null;
    const e = obj(p.entries);
    const t = obj(p.trades);
    const c = obj(p.clutch);
    const u = obj(p.utility);
    const a = obj(p.aim);
    players.push({
      gcId,
      nick: str(p.nick, 40) || gcId,
      steamId: /^\d{17}$/.test(String(p.steamId ?? "")) ? String(p.steamId) : null,
      rp: num(p.rp),
      team,
      k: int(p.k),
      a: int(p.a),
      d: int(p.d),
      adr: num(p.adr),
      kast: num(p.kast),
      fk: int(p.fk),
      mk: int(p.mk),
      fa: int(p.fa),
      hs: int(p.hs),
      hsRate: num(p.hsRate),
      plants: int(p.plants),
      defuses: int(p.defuses),
      multi: (Array.isArray(p.multi) ? p.multi : []).slice(0, 5).map((v) => int(v)),
      rating: num(p.rating),
      swing: num(p.swing),
      entries: { duels: int(e.duels), won: int(e.won), lost: int(e.lost) },
      trades: { made: int(t.made), traded: int(t.traded), avgTime: num(t.avgTime) },
      clutch: {
        situations: int(c.situations),
        won: int(c.won),
        v1Won: int(c.v1Won),
        v1Total: int(c.v1Total),
        vnWon: int(c.vnWon),
        vnTotal: int(c.vnTotal),
        biggest: num(c.biggest),
      },
      utility: { damage: int(u.damage), flashed: int(u.flashed), grenades: int(u.grenades) },
      aim: { accuracy: num(a.accuracy), headAccuracy: num(a.headAccuracy), mainWeapon: str(a.mainWeapon, 24) || null },
    });
  }
  if (players.length < 2) return null;
  const rounds = (Array.isArray(m.rounds) ? m.rounds : []).slice(0, 60).flatMap((x) => {
    const r = obj(x);
    const winner = side(r.winner);
    return winner
      ? [
          {
            winner,
            reason: str(r.reason, 24) || "elimination",
            aSide: r.aSide === "T" ? ("T" as const) : ("CT" as const),
          },
        ]
      : [];
  });
  const clips = (Array.isArray(m.clips) ? m.clips : []).slice(0, 30).flatMap((x) => {
    const c = obj(x);
    const clipId = str(c.clipId, 64);
    return /^[A-Za-z0-9_-]{6,64}$/.test(clipId)
      ? [{ gcId: String(c.gcId ?? ""), clipId, title: str(c.title, 80) }]
      : [];
  });
  return {
    gcMatchId,
    mapHint: str(m.mapHint, 32) || null,
    scoreA: int(m.scoreA, 99),
    scoreB: int(m.scoreB, 99),
    rounds,
    players,
    clips,
  };
}

/**
 * Qual lado da GC é o mandante: o lado com mais jogadores do elenco do
 * mandante (e menos do visitante). Null se não der para saber.
 */
export function homeSideOf(
  players: { team: "A" | "B"; userId: string | null }[],
  homeRoster: Set<string>,
  awayRoster: Set<string>,
): "A" | "B" | null {
  const score = (s: "A" | "B") =>
    players.filter((p) => p.team === s && p.userId && homeRoster.has(p.userId)).length -
    players.filter((p) => p.team === s && p.userId && awayRoster.has(p.userId)).length;
  const a = score("A");
  const b = score("B");
  if (a > b) return "A";
  if (b > a) return "B";
  return null;
}
