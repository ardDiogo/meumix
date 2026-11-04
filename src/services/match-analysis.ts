import "server-only";
import { analysisSheet, checkAiAnalysis, type AiAnalysis, type AnalysisSheet } from "@/lib/match-analysis";
import { mapName } from "@/lib/maps";
import { seriesWinner } from "@/lib/stats";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { GcMapStored } from "@/lib/gc-api";
import type { MapId } from "@/types/domain";
import { textJson, visionConfigured } from "./ai-vision";
import { getDataSource } from "./index";
import { getMatchReport } from "./match-report";

/**
 * Análise da partida pela IA: o MeuMix monta a ficha de números de cada
 * jogador, a IA escreve o parágrafo, a dica e a resenha, e a trava de números
 * (`checkAiAnalysis`) descarta o texto de quem tiver número inventado.
 */

const STRING = { type: "STRING" };
const GEMINI_SCHEMA = {
  type: "OBJECT",
  properties: {
    players: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { id: STRING, text: STRING, tip: STRING, roast: STRING },
        required: ["id", "text", "tip", "roast"],
      },
    },
  },
  required: ["players"],
};
const str = { type: "string" };
const OPENAI_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["players"],
  properties: {
    players: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "text", "tip", "roast"],
        properties: { id: str, text: str, tip: str, roast: str },
      },
    },
  },
};

function prompt(sheet: AnalysisSheet) {
  const players = sheet.players
    .map(
      (p) =>
        `[${p.id}] ${p.name}\n${p.facts.map((f) => `- ${f}`).join("\n")}${p.hint ? `\n- sugestão de dica (pode usar ou trocar): ${p.hint}` : ""}`,
    )
    .join("\n\n");
  return `Você é o analista de desempenho do MeuMix, uma comunidade de amigos que joga mixes de CS2.
Escreva a "Análise da partida": para cada jogador, um parágrafo de técnico que leu as estatísticas, uma dica e uma resenha bem-humorada.

REGRAS
- Use SOMENTE os números das fichas abaixo, escritos exatamente como estão (ratings com vírgula, ex.: 1,36). Não invente rounds, jogadas, números nem acontecimentos.
- Pode citar um colega do MESMO time pelo nome, com os números da ficha dele (ex.: para sugerir quem deve abrir o round).
- "text": 2 a 3 frases, começando pelo que mais marcou o jogo dele (não repita o nome no início). Junte os números com sentido: o que explicam do resultado, onde ganhou ou perdeu o time. Não liste tudo; escolha o que importa.
- "tip": 1 frase prática e específica para o próximo mix (papel, posição de entrada, troca, utilitária, clutch, mira). Nada genérico como "continue assim".
- "text" e "tip": tom de técnico, direto e respeitoso. Elogie com número quem foi bem; aponte o problema com número quem foi mal.
- "roast": a resenha do jogador, 1 ou 2 frases curtas no tom da "Crônica do mix" ("edição sem dó"): zoeira de grupo de WhatsApp entre amigos, com punchline, exagerando o elogio de quem foi bem e zoando quem foi mal. Pode usar um número da ficha. Zoe só o jogo: nada sobre aparência, família, origem, religião, orientação, dinheiro ou vida pessoal. Sem palavrão pesado.
- Português do Brasil.
- Responda um item por jogador, com o "id" da ficha ([j1], [j2]… → "j1", "j2"…).

PARTIDA
${sheet.context.map((c) => `- ${c}`).join("\n")}

FICHAS
${players}`;
}

/** Gera (ou gera de novo) a análise pela IA e grava. Nunca lança erro. */
export async function generateAnalysis(matchId: string, by: string | null = null) {
  try {
    const admin = createSupabaseAdminClient();
    if (!admin) return { ok: false as const, message: "Servidor não configurado." };
    if (!visionConfigured()) return { ok: false as const, message: "Sem chave de IA configurada." };
    const [mix, report, { data: rows }] = await Promise.all([
      getDataSource().getMix(matchId),
      getMatchReport(matchId),
      admin.from("match_gc_maps").select("map_order, map_id, data").eq("match_id", matchId).order("map_order"),
    ]);
    const maps = (rows ?? [])
      .map((r) => ({ ...(r.data as GcMapStored), mapId: r.map_id as string }))
      .filter((m) => Array.isArray(m.players) && Array.isArray(m.rounds));
    if (!mix || !maps.length) return { ok: false as const, message: "Mix sem os dados da GC." };
    const sheet = analysisSheet(maps, {
      winner: seriesWinner(mix),
      teams: { A: mix.teams[0].name, B: mix.teams[1].name },
      names: Object.fromEntries((report?.rows ?? []).filter((r) => r.userId).map((r) => [r.userId!, r.name])),
      mapName: (id) => mapName(id as MapId),
    });
    const ai = await textJson({
      prompt: prompt(sheet),
      geminiSchema: GEMINI_SCHEMA,
      openaiSchema: OPENAI_SCHEMA,
      temperature: 0.7,
      parse: (raw) => {
        const ok = checkAiAnalysis(raw, sheet);
        if (!ok) throw new Error("texto da IA recusado (número fora das fichas ou formato inválido)");
        return ok;
      },
    });
    if (!ai.ok) {
      console.error("[analise] IA:", ai.errors.join(" | ").slice(0, 400));
      return { ok: false as const, message: "A IA não respondeu. Tente de novo em instantes." };
    }
    const { error } = await admin
      .from("mix_analyses")
      .upsert(
        { match_id: matchId, content: ai.value, generated_at: new Date().toISOString(), updated_by: by },
        { onConflict: "match_id" },
      );
    if (error)
      return {
        ok: false as const,
        message:
          error.code === "42P01" ? "Rode a migração 0037_mix_analyses.sql no Supabase." : "Não foi possível salvar.",
      };
    return { ok: true as const };
  } catch (e) {
    console.error("[analise] falha:", e instanceof Error ? e.message : e);
    return { ok: false as const, message: "Não foi possível gerar a análise." };
  }
}

/** Análise da IA gravada (null sem análise ou sem a migração 0037). */
export async function getAnalysis(matchId: string): Promise<{ content: AiAnalysis; generatedAt: string } | null> {
  const admin = createSupabaseAdminClient();
  if (!admin || !/^[0-9a-f-]{36}$/i.test(matchId)) return null;
  const { data, error } = await admin
    .from("mix_analyses")
    .select("content, generated_at")
    .eq("match_id", matchId)
    .maybeSingle();
  if (error || !data) return null;
  return { content: data.content as AiAnalysis, generatedAt: data.generated_at as string };
}
