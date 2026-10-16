"use server";

import { canManageMixes } from "@/lib/auth/permissions";
import { sanitizeMap, type OcrMap } from "@/lib/gc-ocr";
import { audit } from "@/services/audit";
import { getSession } from "@/services/auth";

/**
 * Leitura de um print do placar da Gamers Club com o Gemini
 * (docs/especificacao-tecnica.md, 4.12). Um print por chamada.
 *
 * Variáveis (somente servidor): GEMINI_API_KEY; opcionais GEMINI_MODEL e
 * GEMINI_FALLBACK_MODEL (modelo alternativo usado na hora em caso de sobrecarga).
 */

export type OcrResult = { ok: true; map: OcrMap; model: string } | { ok: false; message: string };

const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_BASE64 = 4_000_000; // ~3 MB de imagem

const PROMPT = `Você vai ler um print do placar final de uma partida de Counter-Strike 2 na Gamers Club.

Leia a tabela pelo CABEÇALHO das colunas, na ordem em que aparecem:
K | A | D | DIFF | ADR | KDR | KAST | S | FA | MK | FK | RP | DROP

Como o print é organizado:
- Dois blocos, um por time. Cada bloco começa com o placar de rounds em destaque seguido do nome do time
  (ex.: "14 Time wAc" → score 14, name "Time wAc") e uma barra "PROBABILIDADE DE VITÓRIA" (ignore).
- Entre os dois blocos há uma linha do tempo dos rounds com ícones e números (ignore).
- Cada time tem 5 linhas de jogadores.

Regras:
- "nick" é o apelido exatamente como escrito, inclusive sites/canais (ex.: "a r D- ardboost.com.br", "twitch.tv/paiked1").
- IGNORE avatar, bandeira, selo de verificado, ícone de anotação, estrela, ícone de saída e o número/selo de nível
  ao lado do nick — não são estatísticas.
- A coluna S costuma vir como "-": use null.
- RP pode ter um ícone (ex.: fogo) ao lado do número: leia só o número, com o sinal.
- KAST é percentual (ex.: "72%" → 72). ADR e KDR podem ter decimais.
- DROP vazio = 0. Coluna inexistente ou ilegível = null.
- RP pode ser negativo (ex.: "-12").
- "map_name": nome do mapa se aparecer no print (ex.: "Mirage", "de_nuke"); senão null.
Responda apenas com o JSON no formato pedido.`;

const PLAYER_SCHEMA = {
  type: "OBJECT",
  properties: {
    nick: { type: "STRING" },
    k: { type: "INTEGER" },
    a: { type: "INTEGER" },
    d: { type: "INTEGER" },
    diff: { type: "INTEGER", nullable: true },
    adr: { type: "NUMBER", nullable: true },
    kdr: { type: "NUMBER", nullable: true },
    kast: { type: "NUMBER", nullable: true },
    s: { type: "INTEGER", nullable: true },
    fa: { type: "INTEGER", nullable: true },
    mk: { type: "INTEGER", nullable: true },
    fk: { type: "INTEGER", nullable: true },
    rp: { type: "INTEGER", nullable: true },
    drop: { type: "INTEGER", nullable: true },
  },
  required: ["nick", "k", "a", "d"],
};

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    map_name: { type: "STRING", nullable: true },
    teams: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING", nullable: true },
          score: { type: "INTEGER", nullable: true },
          players: { type: "ARRAY", items: PLAYER_SCHEMA },
        },
        required: ["players"],
      },
    },
  },
  required: ["teams"],
};

class OverloadedError extends Error {}

/** Extrai o JSON da resposta, tolerando cercas de código ou texto em volta. */
function parseJson(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error("JSON inválido");
  }
}

async function callGemini(model: string, key: string, mimeType: string, data: string): Promise<unknown> {
  const res = await fetch(
    `${process.env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com"}/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: PROMPT }, { inline_data: { mime_type: mimeType, data } }] }],
        generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA },
      }),
      signal: AbortSignal.timeout(45_000),
    },
  );
  // Sobrecarga ou cota: troca imediatamente para o modelo alternativo (sem espera).
  if (res.status === 429 || res.status === 503 || res.status === 500) throw new OverloadedError(`HTTP ${res.status}`);
  if (!res.ok) throw new Error(`Gemini respondeu ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text) throw new Error("Resposta vazia do Gemini");
  return parseJson(text);
}

export async function analyzeGcPrint(image: { mimeType: string; data: string }): Promise<OcrResult> {
  const session = await getSession();
  if (!canManageMixes(session)) return { ok: false, message: "Apenas administradores podem ler prints." };

  const key = process.env.GEMINI_API_KEY;
  if (!key) return { ok: false, message: "Leitura por IA não configurada: defina GEMINI_API_KEY na Vercel." };
  if (!ALLOWED.has(image.mimeType)) return { ok: false, message: "Envie imagens PNG, JPG ou WEBP." };
  if (!image.data || image.data.length > MAX_BASE64) return { ok: false, message: "Imagem muito grande (máx. 3 MB)." };

  const models = [
    process.env.GEMINI_MODEL || "gemini-2.5-flash",
    process.env.GEMINI_FALLBACK_MODEL || "gemini-2.5-flash-lite",
  ];

  let lastError = "";
  for (const model of models) {
    // Até 2 tentativas por modelo para JSON inválido; sobrecarga pula direto para o próximo.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const raw = await callGemini(model, key, image.mimeType, image.data);
        const map = sanitizeMap(raw);
        const players = map.teams[0].players.length + map.teams[1].players.length;
        if (players < 2) throw new Error("Nenhum jogador encontrado no print");
        await audit({ action: "admin.ocr_gc", outcome: "success", actorId: session!.id, detail: { model, players } });
        return { ok: true, map, model };
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
        if (e instanceof OverloadedError) break;
      }
    }
  }
  await audit({ action: "admin.ocr_gc", outcome: "error", actorId: session!.id, detail: { error: lastError } });
  return {
    ok: false,
    message: `Não foi possível ler o print (${lastError}). Tente outra imagem ou preencha manualmente.`,
  };
}
