"use server";

import { canManageMixes } from "@/lib/auth/permissions";
import { csrepRequest, isSafeCsrepPath, OPENAPI_CANDIDATES } from "@/lib/integrations/csrep-api";
import { getSession } from "@/services/auth";

export interface CsrepProbeResult {
  ok: boolean;
  message: string;
  status?: number;
  body?: string;
}

const MAX_BODY = 200_000;

async function allowed() {
  return canManageMixes(await getSession());
}

function errorMessage(e: unknown) {
  if (e instanceof Error && e.name === "TimeoutError") return "O CSRep demorou demais para responder.";
  return e instanceof Error ? e.message : "Falha ao chamar o CSRep.";
}

/** Faz um GET de diagnóstico na API do CSRep e devolve a resposta formatada. */
export async function probeCsrep(path: string): Promise<CsrepProbeResult> {
  if (!(await allowed())) return { ok: false, message: "Apenas administradores podem usar isto." };
  const clean = path.trim().startsWith("/") ? path.trim() : `/${path.trim()}`;
  if (!isSafeCsrepPath(clean))
    return { ok: false, message: "Caminho inválido. Use algo como /matches/gamersclub/123." };
  try {
    const r = await csrepRequest(clean);
    const body = r.json !== null ? JSON.stringify(r.json, null, 2) : r.text;
    return {
      ok: r.status >= 200 && r.status < 300,
      message: `HTTP ${r.status}`,
      status: r.status,
      body: body.slice(0, MAX_BODY),
    };
  } catch (e) {
    return { ok: false, message: errorMessage(e) };
  }
}

/** Procura o documento OpenAPI do CSRep nos endereços mais comuns. */
export async function fetchCsrepSpec(): Promise<CsrepProbeResult> {
  if (!(await allowed())) return { ok: false, message: "Apenas administradores podem usar isto." };
  const tried: string[] = [];
  for (const path of OPENAPI_CANDIDATES) {
    try {
      const r = await csrepRequest(path);
      const hint = r.status === 200 ? "" : ` (${r.text.replace(/\s+/g, " ").slice(0, 120)})`;
      tried.push(`${path} → ${r.status}${hint}`);
      if (r.status === 200 && r.json && typeof r.json === "object" && ("openapi" in r.json || "swagger" in r.json)) {
        return {
          ok: true,
          message: `Especificação encontrada em ${path}`,
          status: 200,
          body: JSON.stringify(r.json, null, 2),
        };
      }
    } catch (e) {
      tried.push(`${path} → ${errorMessage(e)}`);
      if (e instanceof Error && e.message.includes("CSREP_API_KEY")) break;
    }
  }
  return { ok: false, message: `Especificação não encontrada. Tentativas: ${tried.join("; ")}` };
}
