"use server";

import { canManageMixes } from "@/lib/auth/permissions";
import { nickSimilarity, sanitizeMap, type OcrMap } from "@/lib/gc-ocr";
import { audit } from "@/services/audit";
import { getSession } from "@/services/auth";
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BASE64, visionConfigured, visionJson } from "@/services/ai-vision";

/**
 * Leitura de um print do placar da Gamers Club por IA
 * (docs/especificacao-tecnica.md, 4.12). Um print por chamada.
 *
 * Provedores (somente servidor), na ordem de uso:
 * - OpenAI (GPT): OPENAI_API_KEY; opcionais OPENAI_MODEL e OPENAI_FALLBACK_MODEL.
 * - Gemini: GEMINI_API_KEY; opcionais GEMINI_MODEL e GEMINI_FALLBACK_MODEL.
 * Com as duas chaves, o Gemini vira o serviço alternativo do GPT. Em sobrecarga
 * (429/500/503) ou modelo descontinuado (404) troca na hora para o próximo
 * modelo da lista, sem espera.
 */

export type OcrResult = { ok: true; map: OcrMap; model: string } | { ok: false; message: string };

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

const allPlayers = (map: OcrMap) => [...map.teams[0].players, ...map.teams[1].players];
/** Leitura completa = 10 jogadores, todos com ADR e KAST. */
const PERFECT = 10 * 100;
const readScore = (map: OcrMap) =>
  Math.min(allPlayers(map).length, 10) * 100 - missingAdr(map) - allPlayers(map).filter((p) => p.kast == null).length;

const RETRY_REMINDER = `

ATENÇÃO: o print tem 2 times com 5 jogadores cada — devolva os 10 jogadores, sem pular nenhum.
A coluna ADR (5ª coluna, entre DIFF e KDR) tem um número com decimais em TODAS as linhas
(ex.: 84.36, 130.79): preencha "adr" de todos; não deixe null.`;

const ADR_PROMPT = `Neste print do placar da Gamers Club (CS2), leia SOMENTE a coluna ADR (5ª coluna:
K | A | D | DIFF | ADR | KDR | ...) de cada um dos 10 jogadores, com o nick exatamente como escrito.
ADR tem decimais (ex.: 84.36). Responda apenas com o JSON.`;
const ADR_GEMINI = {
  type: "OBJECT",
  properties: {
    players: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { nick: { type: "STRING" }, adr: { type: "NUMBER" } },
        required: ["nick", "adr"],
      },
    },
  },
  required: ["players"],
};
const ADR_OPENAI = {
  type: "object",
  additionalProperties: false,
  properties: {
    players: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { nick: { type: "string" }, adr: { type: "number" } },
        required: ["nick", "adr"],
      },
    },
  },
  required: ["players"],
};

/** Completa o ADR que faltou com uma leitura só dessa coluna (casando pelo nick). */
async function fillAdr(map: OcrMap, image: { mimeType: string; data: string }): Promise<OcrMap> {
  const r = await visionJson({
    prompt: ADR_PROMPT,
    geminiSchema: ADR_GEMINI,
    openaiSchema: ADR_OPENAI,
    image,
    parse: (raw) => {
      const list = (raw as { players?: { nick?: unknown; adr?: unknown }[] }).players ?? [];
      return list
        .map((p) => ({ nick: String(p.nick ?? ""), adr: Number(String(p.adr ?? "").replace(",", ".")) }))
        .filter((p) => p.nick && Number.isFinite(p.adr) && p.adr >= 0 && p.adr <= 500);
    },
  });
  if (!r.ok || !r.value.length) return map;
  const fill = (players: OcrMap["teams"][0]["players"]) =>
    players.map((p) => {
      if (p.adr != null) return p;
      let best: { adr: number; sim: number } | null = null;
      for (const c of r.value) {
        const sim = nickSimilarity(p.nick, c.nick);
        if (sim >= 0.6 && (!best || sim > best.sim)) best = { adr: Math.round(c.adr * 100) / 100, sim };
      }
      return best ? { ...p, adr: best.adr } : p;
    });
  return {
    ...map,
    teams: [
      { ...map.teams[0], players: fill(map.teams[0].players) },
      { ...map.teams[1], players: fill(map.teams[1].players) },
    ],
  };
}

/** Quantos jogadores ficaram sem ADR. */
const missingAdr = (map: OcrMap) =>
  [...map.teams[0].players, ...map.teams[1].players].filter((p) => p.adr == null).length;

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

/** Erro que manda pular direto para o próximo modelo (sobrecarga ou modelo indisponível). */
/** Mesmo formato em JSON Schema estrito (OpenAI Structured Outputs). */
const nullable = (type: string) => ({ type: [type, "null"] });
const OPENAI_PLAYER = {
  type: "object",
  additionalProperties: false,
  properties: {
    nick: { type: "string" },
    k: { type: "integer" },
    a: { type: "integer" },
    d: { type: "integer" },
    diff: nullable("integer"),
    adr: nullable("number"),
    kdr: nullable("number"),
    kast: nullable("number"),
    s: nullable("integer"),
    fa: nullable("integer"),
    mk: nullable("integer"),
    fk: nullable("integer"),
    rp: nullable("integer"),
    drop: nullable("integer"),
  },
  required: ["nick", "k", "a", "d", "diff", "adr", "kdr", "kast", "s", "fa", "mk", "fk", "rp", "drop"],
};
const OPENAI_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    map_name: nullable("string"),
    teams: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: nullable("string"),
          score: nullable("integer"),
          players: { type: "array", items: OPENAI_PLAYER },
        },
        required: ["name", "score", "players"],
      },
    },
  },
  required: ["map_name", "teams"],
};

export async function analyzeGcPrint(image: { mimeType: string; data: string }): Promise<OcrResult> {
  const session = await getSession();
  if (!canManageMixes(session)) return { ok: false, message: "Apenas administradores podem ler prints." };

  if (!visionConfigured()) {
    return { ok: false, message: "Leitura por IA não configurada: defina OPENAI_API_KEY ou GEMINI_API_KEY na Vercel." };
  }
  if (!ALLOWED_IMAGE_TYPES.has(image.mimeType)) return { ok: false, message: "Envie imagens PNG, JPG ou WEBP." };
  if (!image.data || image.data.length > MAX_IMAGE_BASE64) {
    return { ok: false, message: "Imagem muito grande (máx. 3 MB)." };
  }

  const read = (prompt: string) =>
    visionJson({
      prompt,
      geminiSchema: RESPONSE_SCHEMA,
      openaiSchema: OPENAI_SCHEMA,
      image,
      parse: (raw) => {
        const map = sanitizeMap(raw);
        if (map.teams[0].players.length + map.teams[1].players.length < 2) {
          throw new Error("Nenhum jogador encontrado no print");
        }
        return map;
      },
    });
  // A IA às vezes pula jogadores ou deixa a coluna ADR em branco: relê reforçando
  // e fica com a leitura mais completa; se ainda faltar ADR, pede só essa coluna.
  let result = await read(PROMPT);
  if (result.ok && readScore(result.value) < PERFECT) {
    const retry = await read(PROMPT + RETRY_REMINDER);
    if (retry.ok && readScore(retry.value) > readScore(result.value)) result = retry;
  }
  if (result.ok && missingAdr(result.value) > 0) result = { ...result, value: await fillAdr(result.value, image) };
  if (result.ok) {
    const players = result.value.teams[0].players.length + result.value.teams[1].players.length;
    await audit({
      action: "admin.ocr_gc",
      outcome: "success",
      actorId: session!.id,
      detail: { model: result.model, players, sem_adr: missingAdr(result.value) },
    });
    return { ok: true, map: result.value, model: result.model };
  }
  const errors = result.errors;
  await audit({ action: "admin.ocr_gc", outcome: "error", actorId: session!.id, detail: { errors } });
  const lastError = errors.at(-1) ?? "erro desconhecido";
  return {
    ok: false,
    message: `Não foi possível ler o print (${lastError.slice(0, 200)}). Tente outra imagem ou preencha manualmente.`,
  };
}
