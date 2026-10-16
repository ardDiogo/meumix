import "server-only";
import type { DataSource } from "./data-source";
import { demoDataSource } from "./demo/demo-data-source";

/**
 * Resolve a fonte de dados ativa.
 *
 * Hoje apenas a demo existe. Quando a implementação Supabase for criada
 * (ex.: `services/supabase/supabase-data-source.ts`), selecione-a aqui com
 * base em `MEUMIX_DATA_SOURCE` e nas variáveis do Supabase.
 */
export function getDataSource(): DataSource {
  const requested = process.env.MEUMIX_DATA_SOURCE ?? "demo";
  if (requested !== "demo") {
    console.warn(`[meumix] MEUMIX_DATA_SOURCE="${requested}" ainda não é suportado. Usando dados demonstrativos.`);
  }
  return demoDataSource;
}

export type { DataSource } from "./data-source";
