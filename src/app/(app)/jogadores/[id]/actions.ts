"use server";

import { revalidatePath } from "next/cache";
import { canManageMixes } from "@/lib/auth/permissions";
import { CSREP_METRICS, parseCsrepInput, sanitizeCsrep } from "@/lib/csrep";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BASE64, visionConfigured, visionJson } from "@/services/ai-vision";
import { audit } from "@/services/audit";
import { getSession } from "@/services/auth";

export type CsrepResult = { ok: boolean; message: string };

const DAILY_LIMIT = 5;
const MIGRATION_HINT = "Rode a migração 0013_csrep.sql no Supabase.";

/** O próprio jogador ou um administrador. */
async function authorize(userId: string) {
  const session = await getSession();
  if (!session) return { error: "Entre na sua conta para continuar." } as const;
  if (session.id !== userId && !canManageMixes(session)) {
    return { error: "Só o próprio jogador ou um administrador pode fazer isso." } as const;
  }
  const admin = createSupabaseAdminClient();
  if (!admin) return { error: "O banco de dados não está configurado no servidor." } as const;
  return { session, admin } as const;
}

const isMissing = (code?: string) => code === "42703" || code === "42P01" || code === "PGRST205";

export async function saveCsrepLink(userId: string, input: string): Promise<CsrepResult> {
  const auth = await authorize(userId);
  if ("error" in auth) return { ok: false, message: auth.error! };
  const url = input.trim() ? parseCsrepInput(input) : null;
  if (input.trim() && !url) return { ok: false, message: "Link inválido. Ex.: https://csrep.gg/player/76561198…" };
  const { error } = await auth.admin.from("profiles").update({ csrep_url: url }).eq("id", userId);
  if (error) return { ok: false, message: isMissing(error.code) ? MIGRATION_HINT : "Não foi possível salvar." };
  revalidatePath(`/jogadores/${userId}`);
  return { ok: true, message: url ? "Link do CSRep salvo." : "Link do CSRep removido." };
}

/* ------------------------------ Análise por IA ------------------------------ */

const METRIC_KEYS = CSREP_METRICS.map((m) => m.key);
const ITEM = {
  type: "OBJECT",
  properties: { title: { type: "STRING" }, detail: { type: "STRING" } },
  required: ["title", "detail"],
};
const GEMINI_SCHEMA = {
  type: "OBJECT",
  properties: {
    metrics: {
      type: "OBJECT",
      properties: {
        period: { type: "STRING", nullable: true },
        ...Object.fromEntries(METRIC_KEYS.map((k) => [k, { type: "NUMBER", nullable: true }])),
      },
    },
    analysis: {
      type: "OBJECT",
      properties: {
        summary: { type: "STRING" },
        strengths: { type: "ARRAY", items: ITEM },
        weaknesses: { type: "ARRAY", items: ITEM },
        improvements: { type: "ARRAY", items: ITEM },
      },
      required: ["summary", "strengths", "weaknesses", "improvements"],
    },
  },
  required: ["metrics", "analysis"],
};
const O_ITEM = {
  type: "object",
  additionalProperties: false,
  properties: { title: { type: "string" }, detail: { type: "string" } },
  required: ["title", "detail"],
};
const OPENAI_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    metrics: {
      type: "object",
      additionalProperties: false,
      properties: {
        period: { type: ["string", "null"] },
        ...Object.fromEntries(METRIC_KEYS.map((k) => [k, { type: ["number", "null"] }])),
      },
      required: ["period", ...METRIC_KEYS],
    },
    analysis: {
      type: "object",
      additionalProperties: false,
      properties: {
        summary: { type: "string" },
        strengths: { type: "array", items: O_ITEM },
        weaknesses: { type: "array", items: O_ITEM },
        improvements: { type: "array", items: O_ITEM },
      },
      required: ["summary", "strengths", "weaknesses", "improvements"],
    },
  },
  required: ["metrics", "analysis"],
};

function buildPrompt(nick: string, mixContext: string) {
  return `Você é um analista/treinador de Counter-Strike 2. A imagem é um print do perfil do jogador "${nick}" no CSRep (csrep.gg).

1) LEIA as métricas do bloco "STATS OVERVIEW" (e o Trust Score, se aparecer). Use números com ponto decimal
   (ex.: "7,8°" → 7.8; "514 ms" → 514; "23,9 %" → 23.9). Não aparece ou ilegível = null.
   Chaves: trust_score, time_to_damage (ms), reaction_time (ms), crosshair_placement (graus), preaim (graus),
   kd_ratio, adr, aim_accuracy (%), head_accuracy (%), wallbang_kill_pct (%), smoke_kill_pct (%),
   hltv_rating, kast (%). "period" = o período mostrado (ex.: "Last 90 matches").

2) ANALISE em português do Brasil, de forma direta e útil para um jogador amador de mix:
   - Referências aproximadas: time to damage bom < 500 ms; reaction time bom < 320 ms; crosshair placement
     bom < 6°; preaim bom < 8°; aim accuracy boa > 25%; head accuracy boa > 18%; HLTV 1.00 = média; KAST bom > 70%.
     Em tempo e graus, menor é melhor. Os gráficos do print mostram onde o jogador está na distribuição.
   - "summary": 2 a 3 frases sobre o estilo e o nível do jogador.
   - "strengths": 2 a 4 pontos fortes, citando os números.
   - "weaknesses": 2 a 4 pontos fracos, citando os números.
   - "improvements": 3 a 5 sugestões práticas de treino (ex.: Aim Botz, deathmatch, mapas de prefire, posicionamento
     da mira, uso de utilitária), cada uma ligada a um ponto fraco.
   - Não invente números que não estão no print. Não comente sobre trapaça.
${mixContext ? `\nContexto (estatísticas do jogador nos mixes do MeuMix, só para comparar):\n${mixContext}\n` : ""}
Responda apenas com o JSON no formato pedido.`;
}

export async function analyzeCsrepPrint(
  userId: string,
  image: { mimeType: string; data: string },
): Promise<CsrepResult> {
  const auth = await authorize(userId);
  if ("error" in auth) return { ok: false, message: auth.error! };
  const { admin, session } = auth;
  if (!visionConfigured()) return { ok: false, message: "Leitura por IA não configurada (GEMINI_API_KEY)." };
  if (!ALLOWED_IMAGE_TYPES.has(image.mimeType)) return { ok: false, message: "Envie uma imagem PNG, JPG ou WEBP." };
  if (!image.data || image.data.length > MAX_IMAGE_BASE64) return { ok: false, message: "Imagem muito grande." };

  // Limite diário por jogador (cada análise consome a cota da IA).
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count, error: countError } = await admin
    .from("player_ai_analyses")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", since);
  if (countError) return { ok: false, message: isMissing(countError.code) ? MIGRATION_HINT : "Erro ao consultar." };
  if ((count ?? 0) >= DAILY_LIMIT) {
    return { ok: false, message: `Limite de ${DAILY_LIMIT} análises por dia para este jogador. Tente amanhã.` };
  }

  const { data: p } = await admin
    .from("profiles")
    .select("display_name, elo, mixes_played, total_kills, total_deaths, total_wins, total_losses, avg_adr, avg_kast")
    .eq("id", userId)
    .maybeSingle();
  const nick = (p?.display_name as string | undefined) ?? "jogador";
  const mixes = (p?.mixes_played as number | undefined) ?? 0;
  const mixContext = mixes
    ? `ELO ${p!.elo}; ${mixes} mixes; ${p!.total_wins}V/${p!.total_losses}D; K/D ${(
        (p!.total_kills as number) / Math.max(1, p!.total_deaths as number)
      ).toFixed(2)}; ADR ${p!.avg_adr ?? "-"}; KAST ${p!.avg_kast ?? "-"}%`
    : "";

  const result = await visionJson({
    prompt: buildPrompt(nick, mixContext),
    geminiSchema: GEMINI_SCHEMA,
    openaiSchema: OPENAI_SCHEMA,
    image,
    parse: sanitizeCsrep,
  });
  if (!result.ok) {
    await audit({
      action: "player.csrep_ai",
      outcome: "error",
      actorId: session.id,
      detail: { userId, errors: result.errors },
    });
    return {
      ok: false,
      message: `Não foi possível analisar o print (${(result.errors.at(-1) ?? "erro").slice(0, 160)}).`,
    };
  }

  const { error } = await admin.from("player_ai_analyses").insert({
    user_id: userId,
    source: "csrep",
    metrics: result.value.metrics,
    analysis: result.value.analysis,
    model: result.model,
    created_by: session.id,
  });
  if (error)
    return { ok: false, message: isMissing(error.code) ? MIGRATION_HINT : "Não foi possível salvar a análise." };
  await audit({
    action: "player.csrep_ai",
    outcome: "success",
    actorId: session.id,
    detail: { userId, model: result.model },
  });
  revalidatePath(`/jogadores/${userId}`);
  return { ok: true, message: "Análise pronta!" };
}
