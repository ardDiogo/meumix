import "server-only";

/**
 * Leitura de imagens por IA (somente servidor), com JSON estruturado.
 * Provedores, na ordem: OpenAI (OPENAI_API_KEY; OPENAI_MODEL e
 * OPENAI_FALLBACK_MODEL opcionais) e Gemini (GEMINI_API_KEY; GEMINI_MODEL e
 * GEMINI_FALLBACK_MODEL opcionais). Em sobrecarga (429/500/503) ou modelo
 * descontinuado (404) troca na hora para o próximo modelo da lista.
 */

export interface VisionImage {
  mimeType: string;
  data: string;
}

/** Erro que manda pular direto para o próximo modelo. */
class SkipModelError extends Error {}
const SKIP_STATUS = new Set([404, 429, 500, 503]);

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

async function callGemini(model: string, key: string, prompt: string, schema: object, image: VisionImage) {
  const res = await fetch(
    `${process.env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com"}/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [
          { role: "user", parts: [{ text: prompt }, { inline_data: { mime_type: image.mimeType, data: image.data } }] },
        ],
        generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema: schema },
      }),
      signal: AbortSignal.timeout(45_000),
    },
  );
  if (SKIP_STATUS.has(res.status)) throw new SkipModelError(`${model}: HTTP ${res.status}`);
  if (!res.ok) throw new Error(`Gemini respondeu ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text) throw new Error("Resposta vazia do Gemini");
  return parseJson(text);
}

async function callOpenAI(model: string, key: string, prompt: string, schema: object, image: VisionImage) {
  const res = await fetch(`${process.env.OPENAI_API_BASE || "https://api.openai.com"}/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: `data:${image.mimeType};base64,${image.data}`, detail: "high" } },
          ],
        },
      ],
      response_format: { type: "json_schema", json_schema: { name: "result", strict: true, schema } },
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (SKIP_STATUS.has(res.status)) throw new SkipModelError(`${model}: HTTP ${res.status}`);
  if (!res.ok) throw new Error(`OpenAI respondeu ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as { choices?: { message?: { content?: string; refusal?: string } }[] };
  const message = body.choices?.[0]?.message;
  if (message?.refusal) throw new Error(`OpenAI recusou: ${message.refusal}`);
  if (!message?.content) throw new Error("Resposta vazia da OpenAI");
  return parseJson(message.content);
}

type Provider = {
  label: string;
  call: (prompt: string, gemini: object, openai: object, image: VisionImage) => Promise<unknown>;
};

function providers(): Provider[] {
  const list: Provider[] = [];
  const openai = process.env.OPENAI_API_KEY;
  if (openai) {
    for (const model of [
      process.env.OPENAI_MODEL || "gpt-4.1-mini",
      process.env.OPENAI_FALLBACK_MODEL || "gpt-4o-mini",
    ]) {
      list.push({ label: `openai:${model}`, call: (p, _g, o, img) => callOpenAI(model, openai, p, o, img) });
    }
  }
  const gemini = process.env.GEMINI_API_KEY;
  if (gemini) {
    // Modelos do Google mudam com frequência: os configurados e depois os atuais conhecidos.
    const models = [
      process.env.GEMINI_MODEL,
      process.env.GEMINI_FALLBACK_MODEL,
      "gemini-3.5-flash",
      "gemini-3.5-flash-lite",
      "gemini-flash-latest",
      "gemini-2.5-flash",
    ].filter((m, i, all): m is string => !!m && all.indexOf(m) === i);
    for (const model of models) {
      list.push({ label: `gemini:${model}`, call: (p, g, _o, img) => callGemini(model, gemini, p, g, img) });
    }
  }
  return list;
}

export const visionConfigured = () => providers().length > 0;

export type VisionResult<T> = { ok: true; value: T; model: string } | { ok: false; errors: string[] };

/**
 * Envia a imagem para o primeiro provedor disponível e valida a resposta com
 * `parse` (que deve lançar erro se o conteúdo não servir). Até 2 tentativas
 * por modelo; sobrecarga pula direto para o próximo.
 */
export async function visionJson<T>(opts: {
  prompt: string;
  geminiSchema: object;
  openaiSchema: object;
  image: VisionImage;
  parse: (raw: unknown) => T;
}): Promise<VisionResult<T>> {
  const errors: string[] = [];
  for (const { label, call } of providers()) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const raw = await call(opts.prompt, opts.geminiSchema, opts.openaiSchema, opts.image);
        return { ok: true, value: opts.parse(raw), model: label };
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
        if (e instanceof SkipModelError) break;
      }
    }
  }
  return { ok: false, errors };
}

export const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
export const MAX_IMAGE_BASE64 = 4_000_000; // ~3 MB de imagem
