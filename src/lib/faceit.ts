import type { OcrMap, OcrPlayer } from "./gc-ocr";

/**
 * Faceit Data API v4 (docs/especificacao-tecnica.md, 4.12): converte as
 * estatísticas de uma partida no mesmo formato dos prints da GC, para usar a
 * mesma junção de mapas e o mesmo formulário de finalização. Funções puras.
 */

/** Extrai o id da partida do link da sala (…/room/1-xxxxxxxx-…) ou do id puro. */
export function faceitMatchId(input: string): string | null {
  const m = input.trim().match(/(1-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  return m ? m[1]!.toLowerCase() : null;
}

type Stats = Record<string, string | number | undefined>;

interface FaceitStatsResponse {
  rounds?: {
    round_stats?: Stats;
    teams?: {
      team_id?: string;
      team_stats?: Stats;
      players?: { player_id: string; nickname: string; player_stats?: Stats }[];
    }[];
  }[];
}

interface FaceitMatchResponse {
  teams?: Record<
    string,
    { faction_id?: string; name?: string; roster?: { player_id: string; nickname: string; game_player_id?: string }[] }
  >;
}

const num = (v: unknown) => {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const int = (v: unknown) => Math.max(0, Math.round(num(v) ?? 0));
/** Primeiro campo existente entre os nomes possíveis (a Faceit varia os rótulos). */
const pick = (s: Stats | undefined, ...keys: string[]) => {
  for (const k of keys) if (s?.[k] !== undefined && s[k] !== "") return s[k];
  return undefined;
};

export interface FaceitParsed {
  maps: OcrMap[];
  /** player_id da Faceit → SteamID64, para vincular aos perfis. */
  steamOf: Record<string, string>;
  /** nick na Faceit → player_id. */
  idOf: Record<string, string>;
}

/** Converte /matches/{id} + /matches/{id}/stats (um mapa por round da série). */
export function parseFaceit(match: FaceitMatchResponse, stats: FaceitStatsResponse): FaceitParsed {
  const steamOf: Record<string, string> = {};
  const idOf: Record<string, string> = {};
  for (const team of Object.values(match.teams ?? {})) {
    for (const p of team.roster ?? []) {
      if (p.game_player_id) steamOf[p.player_id] = p.game_player_id;
      idOf[p.nickname] = p.player_id;
    }
  }
  const maps: OcrMap[] = (stats.rounds ?? []).map((round) => {
    const teams = (round.teams ?? []).slice(0, 2).map((t) => ({
      name: (pick(t.team_stats, "Team") as string | undefined) ?? null,
      score: num(pick(t.team_stats, "Final Score", "Score")),
      players: (t.players ?? []).map((p): OcrPlayer => {
        const s = p.player_stats;
        idOf[p.nickname] = p.player_id;
        const k = int(pick(s, "Kills"));
        const d = int(pick(s, "Deaths"));
        const adr = num(pick(s, "ADR", "Average Damage per Round"));
        return {
          nick: p.nickname,
          k,
          a: int(pick(s, "Assists")),
          d,
          diff: k - d,
          adr: adr == null ? null : Math.min(Math.max(adr, 0), 500),
          kdr: Math.round((k / Math.max(d, 1)) * 100) / 100,
          kast: null, // a Faceit não informa KAST
          s: 0,
          fa: int(pick(s, "Flash Successes", "Flash Assists")),
          mk:
            int(pick(s, "Double Kills")) +
            int(pick(s, "Triple Kills")) +
            int(pick(s, "Quadro Kills")) +
            int(pick(s, "Penta Kills")),
          fk: int(pick(s, "First Kills", "Entry Wins")),
          rp: 0, // a Faceit não tem RP: o admin define no formulário
          drop: 0,
        };
      }),
    }));
    while (teams.length < 2) teams.push({ name: null, score: null, players: [] });
    return {
      mapName: (pick(round.round_stats, "Map") as string | undefined) ?? null,
      teams: [teams[0]!, teams[1]!],
    };
  });
  return { maps, steamOf, idOf };
}
