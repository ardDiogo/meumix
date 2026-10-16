"use client";

import { createBrowserClient } from "@supabase/ssr";
import { supabaseConfig } from "./config";

let client: ReturnType<typeof createBrowserClient> | null = null;

/** Cliente Supabase do navegador (usado para o tempo real). `null` sem configuração. */
export function getSupabaseBrowserClient() {
  const config = supabaseConfig();
  if (!config) return null;
  return (client ??= createBrowserClient(config.url, config.anonKey));
}
