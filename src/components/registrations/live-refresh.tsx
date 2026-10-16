"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

const TABLES = ["mix_registrations", "map_votes", "captain_votes"] as const;

/**
 * Atualiza o painel sozinho quando inscrições ou votos mudam (seção 11).
 * Usa `router.refresh()`: busca os dados de novo sem recarregar a página.
 */
export function LiveRefresh({ scheduleId }: { scheduleId: string }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 300);
    };

    const channel = supabase.channel(`mix-${scheduleId}`);
    for (const table of TABLES) {
      // Filtros não se aplicam a DELETE no Supabase Realtime: exclusões chegam sem filtro.
      for (const event of ["INSERT", "UPDATE"] as const) {
        channel.on(
          "postgres_changes",
          { event, schema: "public", table, filter: `schedule_id=eq.${scheduleId}` },
          refresh,
        );
      }
      channel.on("postgres_changes", { event: "DELETE", schema: "public", table }, refresh);
    }
    channel.on("postgres_changes", { event: "*", schema: "public", table: "mix_schedules" }, refresh);
    channel.subscribe();

    return () => {
      clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [router, scheduleId]);

  return null;
}
