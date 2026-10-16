"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const RESYNC_MS = 5 * 60_000;

/**
 * Relógio corrigido pelo servidor (docs/regras-do-mix.md, seção 1).
 * Mede a diferença local × servidor compensando metade do tempo de ida e volta.
 * Ressincroniza a cada 5 min e quando o jogador volta para a aba.
 */
export function useServerClock() {
  const offset = useRef(0);
  const [synced, setSynced] = useState(false);

  const sync = useCallback(async () => {
    try {
      const t0 = Date.now();
      const res = await fetch("/api/time", { cache: "no-store" });
      const t1 = Date.now();
      const { now } = (await res.json()) as { now: number };
      offset.current = now + (t1 - t0) / 2 - t1;
      setSynced(true);
    } catch {
      // Mantém o último offset conhecido; tenta de novo no próximo ciclo.
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(sync, 0);
    const id = setInterval(sync, RESYNC_MS);
    const onVisible = () => document.visibilityState === "visible" && void sync();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(first);
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [sync]);

  const now = useCallback(() => Date.now() + offset.current, []);
  return { synced, now, sync };
}

/** Re-renderiza a cada `ms` (contagem regressiva). */
export function useTick(ms = 1000) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
}
