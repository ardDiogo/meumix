import "server-only";
import {
  checkAiChronicle,
  chronicleFacts,
  templateChronicle,
  type Chronicle,
  type ChronicleInput,
  type PlayerHistory,
} from "@/lib/chronicle";
import { mapName } from "@/lib/maps";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getDataSource } from "./index";
import { textJson, visionConfigured } from "./ai-vision";
import { bolaoForMatch } from "./bolao";
import { getMatchReport } from "./match-report";
import { getRanking } from "./queries";

/**
 * Crônica do mix: o MeuMix calcula os fatos, a IA escreve no tom "sem dó" e a
 * trava de números (`checkAiChronicle`) descarta qualquer número inventado.
 * Sem IA ou se ela falhar, usa o modelo pronto (`templateChronicle`).
 */

export interface StoredChronicle {
  content: Chronicle;
  source: "ia" | "modelo" | "admin";
  hidden: boolean;
  generatedAt: string;
}

type Admin = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

interface MatchRow {
  id: string;
  event_date: string;
  finalized_at: string | null;
  maps: { score_a: number | null; score_b: number | null }[] | null;
}

/** Sequências (vitórias, derrotas, lanterna, MVP) de cada jogador até este mix. */
async function histories(admin: Admin, matchId: string, ids: string[]) {
  const result: Record<string, PlayerHistory> = {};
  if (!ids.length) return result;
  const [{ data: matches }, { data: records }] = await Promise.all([
    admin.from("mix_matches").select("id, event_date, finalized_at, maps"),
    admin
      .from("player_match_records")
      .select("match_id, user_id, team, is_mvp, is_lanterna")
      .in("user_id", ids)
      .limit(10000),
  ]);
  const order = ((matches ?? []) as MatchRow[]).sort(
    (a, b) =>
      a.event_date.localeCompare(b.event_date) ||
      (a.finalized_at ?? "").localeCompare(b.finalized_at ?? "") ||
      a.id.localeCompare(b.id),
  );
  const cut = order.findIndex((m) => m.id === matchId);
  const until = cut >= 0 ? order.slice(0, cut + 1) : order;
  const winnerOf = new Map(
    until.map((m) => {
      let a = 0;
      let b = 0;
      for (const x of m.maps ?? []) {
        if (x.score_a == null || x.score_b == null || x.score_a === x.score_b) continue;
        if (x.score_a > x.score_b) a++;
        else b++;
      }
      return [m.id, a > b ? "A" : b > a ? "B" : null] as const;
    }),
  );
  const byUser = new Map<string, Map<string, { team: string; mvp: boolean; lant: boolean }>>();
  for (const r of records ?? []) {
    const map = byUser.get(r.user_id as string) ?? new Map();
    map.set(r.match_id as string, { team: r.team as string, mvp: !!r.is_mvp, lant: !!r.is_lanterna });
    byUser.set(r.user_id as string, map);
  }
  for (const id of ids) {
    const played = until.filter((m) => byUser.get(id)?.has(m.id));
    const streak = (test: (m: MatchRow) => boolean) => {
      let n = 0;
      for (let i = played.length - 1; i >= 0 && test(played[i]!); i--) n++;
      return n;
    };
    const rec = (m: MatchRow) => byUser.get(id)!.get(m.id)!;
    result[id] = {
      mixes: played.length,
      winStreak: streak((m) => winnerOf.get(m.id) === rec(m).team),
      lossStreak: streak((m) => winnerOf.get(m.id) != null && winnerOf.get(m.id) !== rec(m).team),
      lanternaStreak: streak((m) => rec(m).lant),
      mvpStreak: streak((m) => rec(m).mvp),
    };
  }
  return result;
}

/** Junta os dados do mix finalizado no formato da crônica. */
export async function chronicleInput(matchId: string): Promise<ChronicleInput | null> {
  const admin = createSupabaseAdminClient();
  if (!admin) return null;
  const [mix, report] = await Promise.all([getDataSource().getMix(matchId), getMatchReport(matchId)]);
  if (!mix || mix.status !== "finished" || !report?.rows.length) return null;

  const ids = report.rows.map((r) => r.userId).filter((id): id is string => !!id);
  const [history, ranking, bolao] = await Promise.all([
    histories(admin, matchId, ids),
    getRanking({ period: "all" }).catch(() => null),
    bolaoForMatch(matchId).catch(() => null),
  ]);
  const leader = ranking?.rows[0];
  let best: { names: string[]; points: number } | null = null;
  if (bolao?.entries.length) {
    const top = Math.max(...bolao.entries.map((e) => e.score?.points ?? 0));
    best = { points: top, names: bolao.entries.filter((e) => (e.score?.points ?? 0) === top).map((e) => e.name) };
  }

  return {
    seed: matchId,
    date: mix.scheduledAt.slice(0, 10),
    teams: { A: mix.teams[0].name, B: mix.teams[1].name },
    maps: mix.maps.map((m) => ({ name: mapName(m.mapId), scoreA: m.scoreA, scoreB: m.scoreB })),
    players: [...report.rows]
      .sort((a, b) => b.k - a.k || b.a - a.a)
      .map((r) => ({
        id: r.userId,
        name: r.profileNick ?? r.name,
        team: r.team,
        k: r.k,
        a: r.a,
        d: r.d,
        adr: r.adr,
        fk: r.fk,
        rp: r.rp,
        isMvp: r.isMvp,
        isLanterna: r.isLanterna,
      })),
    history,
    leader: leader ? { name: leader.player.nickname, elo: leader.elo } : null,
    bolao: bolao?.entries.length
      ? {
          bets: bolao.entries.length,
          winnerHits: bolao.entries.filter((e) => e.score?.winner).length,
          mvpHits: bolao.entries.filter((e) => e.score?.mvp).length,
          lanternaHits: bolao.entries.filter((e) => e.score?.lanterna).length,
          best,
        }
      : null,
  };
}

const STRING = { type: "STRING" };
const GEMINI_SCHEMA = {
  type: "OBJECT",
  properties: {
    headline: STRING,
    intro: STRING,
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { emoji: STRING, title: STRING, text: STRING },
        required: ["emoji", "title", "text"],
      },
    },
    closing: STRING,
  },
  required: ["headline", "intro", "items", "closing"],
};
const str = { type: "string" };
const OPENAI_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "intro", "items", "closing"],
  properties: {
    headline: str,
    intro: str,
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["emoji", "title", "text"],
        properties: { emoji: str, title: str, text: str },
      },
    },
    closing: str,
  },
};

function prompt(facts: string[], example: Chronicle) {
  return `Você escreve a "Crônica do mix" do MeuMix, uma comunidade de amigos que joga mixes de CS2.
Tom: "edição sem dó" — zoeira pesada e engraçada, estilo resenha de grupo de WhatsApp entre amigos.

REGRAS
- Use SOMENTE os fatos abaixo. Não invente jogadas, rounds, números, apelidos nem acontecimentos.
- Todo número que você escrever precisa estar nos fatos (pode escrever por extenso até "cinco").
- Zoe só o desempenho no jogo. Nada sobre aparência, família, origem, religião, orientação, deficiência, dinheiro ou vida pessoal. Sem palavrão pesado.
- Português do Brasil, frases curtas, com punchline. Elogie quem jogou bem com exagero e zoe quem jogou mal.
- "headline": subtítulo curto (ex.: "Edição sem dó").
- "intro": 2 ou 3 frases sobre o resultado e como ele saiu.
- "items": de 5 a 7 tópicos, um por jogador em destaque (MVP primeiro; lanterna sempre por último, citando a sequência se houver). "emoji": um emoji; "title": nome do jogador e, se quiser, um apelido curto; "text": 1 a 3 frases com os números.
- "closing": 1 ou 2 linhas sobre o bolão e/ou o líder do ranking, se estiverem nos fatos; senão, uma frase de fechamento.

FATOS
${facts.map((f) => `- ${f}`).join("\n")}

EXEMPLO DO FORMATO (escrito sem IA para este mesmo mix; use como referência de tom, escreva o seu):
${JSON.stringify(example)}`;
}

/** Gera (ou gera de novo) a crônica do mix e grava. Nunca lança erro. */
export async function generateChronicle(matchId: string, by: string | null = null) {
  try {
    const admin = createSupabaseAdminClient();
    const input = await chronicleInput(matchId);
    if (!admin || !input) return { ok: false as const, message: "Mix não encontrado ou sem estatísticas." };
    const facts = chronicleFacts(input);
    const fallback = templateChronicle(input);
    let content = fallback;
    let source: StoredChronicle["source"] = "modelo";
    if (visionConfigured()) {
      const ai = await textJson({
        prompt: prompt(facts, fallback),
        geminiSchema: GEMINI_SCHEMA,
        openaiSchema: OPENAI_SCHEMA,
        temperature: 1,
        parse: (raw) => {
          const ok = checkAiChronicle(raw, facts, input);
          if (!ok) throw new Error("texto da IA recusado (número fora dos fatos ou formato inválido)");
          return ok;
        },
      });
      if (ai.ok) {
        content = ai.value;
        source = "ia";
      } else console.error("[cronica] IA:", ai.errors.join(" | ").slice(0, 400));
    }
    const { error } = await admin
      .from("mix_chronicles")
      .upsert(
        { match_id: matchId, content, source, generated_at: new Date().toISOString(), updated_by: by },
        { onConflict: "match_id" },
      );
    if (error) {
      return {
        ok: false as const,
        message:
          error.code === "42P01" ? "Rode a migração 0032_mix_chronicles.sql no Supabase." : "Não foi possível salvar.",
      };
    }
    return { ok: true as const, source, aiTried: visionConfigured() };
  } catch (e) {
    console.error("[cronica] falha:", e instanceof Error ? e.message : e);
    return { ok: false as const, message: "Não foi possível gerar a crônica." };
  }
}

/** Crônica gravada do mix (null sem crônica ou sem a migração 0032). */
export async function getChronicle(matchId: string): Promise<StoredChronicle | null> {
  const admin = createSupabaseAdminClient();
  if (!admin || !/^[0-9a-f-]{36}$/i.test(matchId)) return null;
  const { data, error } = await admin
    .from("mix_chronicles")
    .select("content, source, hidden, generated_at")
    .eq("match_id", matchId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    content: data.content as Chronicle,
    source: data.source as StoredChronicle["source"],
    hidden: !!data.hidden,
    generatedAt: data.generated_at as string,
  };
}

/** Mix finalizado há menos de 5 minutos (a crônica pode estar sendo escrita). */
export async function chronicleInProgress(matchId: string) {
  const admin = createSupabaseAdminClient();
  if (!admin) return false;
  const { data } = await admin.from("mix_matches").select("finalized_at").eq("id", matchId).maybeSingle();
  return !!data?.finalized_at && Date.now() - new Date(data.finalized_at as string).getTime() < 5 * 60_000;
}
