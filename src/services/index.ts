import "server-only";
import type { DataSource } from "./data-source";
import { isAuthConfigured } from "@/lib/supabase/config";
import { demoDataSource } from "./demo/demo-data-source";
import { supabaseDataSource } from "./supabase/supabase-data-source";

/**
 * Resolve a fonte de dados ativa: com o Supabase configurado, usa os dados
 * reais; `MEUMIX_DATA_SOURCE=demo` força os dados demonstrativos.
 */
export function getDataSource(): DataSource {
  if (process.env.MEUMIX_DATA_SOURCE === "demo" || !isAuthConfigured()) return demoDataSource;
  return supabaseDataSource;
}

export type { DataSource } from "./data-source";
