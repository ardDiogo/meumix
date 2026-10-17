/**
 * Cliente da API de desenvolvedor do CSRep (https://csrep.gg/api, header
 * `X-API-Key`). A chave fica só no servidor em `CSREP_API_KEY`; a base pode ser
 * trocada por `CSREP_API_BASE`.
 */
const DEFAULT_BASE = "https://csrep.gg/api";
const TIMEOUT_MS = 15_000;

export function csrepApiBase() {
  return (process.env.CSREP_API_BASE?.trim() || DEFAULT_BASE).replace(/\/+$/, "");
}

export function csrepApiConfigured() {
  return Boolean(process.env.CSREP_API_KEY?.trim());
}

/** Caminho relativo seguro: só caracteres de URL comuns, sem trocar de host. */
export function isSafeCsrepPath(path: string) {
  return /^\/[A-Za-z0-9_\-/.?=&%]*$/.test(path) && !path.includes("//") && !path.includes("..");
}

export interface CsrepResponse {
  status: number;
  json: unknown;
  text: string;
}

export async function csrepRequest(path: string, init: RequestInit = {}): Promise<CsrepResponse> {
  const key = process.env.CSREP_API_KEY?.trim();
  if (!key) throw new Error("CSREP_API_KEY não configurada.");
  if (!isSafeCsrepPath(path)) throw new Error("Caminho inválido.");
  const res = await fetch(`${csrepApiBase()}${path}`, {
    ...init,
    headers: { Accept: "application/json", ...init.headers, "X-API-Key": key },
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    // resposta não-JSON: devolve o texto
  }
  return { status: res.status, json, text };
}

/** Endereços prováveis do documento OpenAPI publicado pelo CSRep. */
export const OPENAPI_CANDIDATES = [
  "/openapi.json",
  "/docs/openapi.json",
  "/docs/json",
  "/swagger.json",
  "/openapi",
  "/docs-json",
];
