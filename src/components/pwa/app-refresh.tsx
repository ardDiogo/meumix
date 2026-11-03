"use client";

import { RotateCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** Fora do app por mais que isso: ao voltar, os dados são atualizados. */
const STALE_MS = 30_000;
/** Quanto puxar para baixo (px) para atualizar no app instalado. */
const PULL_PX = 80;

async function fetchVersion() {
  try {
    const r = await fetch("/api/version", { cache: "no-store" });
    return r.ok ? ((await r.json()) as { v: string }).v : null;
  } catch {
    return null;
  }
}

const reload = () => window.location.reload();

/** Botão de atualizar (no app instalado não existe o botão do navegador). */
export function RefreshButton({ className }: { className?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      aria-label="Atualizar"
      title="Atualizar"
      onClick={() => {
        setBusy(true);
        reload();
      }}
      className={cn(
        "flex size-9 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-fg",
        className,
      )}
    >
      <RotateCw className={cn("size-4", busy && "animate-spin")} />
    </button>
  );
}

/**
 * Mantém o site e o app em dia (uma vez, no layout raiz):
 * - voltou ao app depois de um tempo: busca os dados de novo; se saiu uma
 *   versão nova do site, recarrega de vez;
 * - no app instalado, puxar a página para baixo (no topo) atualiza.
 */
export function AppRefresh() {
  const router = useRouter();
  const version = useRef<string | null>(null);
  const hiddenAt = useRef<number | null>(null);
  const [pull, setPull] = useState(0);

  useEffect(() => {
    fetchVersion().then((v) => (version.current = v));
    const onVisibility = async () => {
      if (document.visibilityState === "hidden") {
        hiddenAt.current = Date.now();
        return;
      }
      const away = hiddenAt.current ? Date.now() - hiddenAt.current : 0;
      hiddenAt.current = null;
      if (away < STALE_MS) return;
      const v = await fetchVersion();
      if (v && version.current && v !== version.current) reload();
      else router.refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [router]);

  // Puxar para atualizar: só no app instalado (no navegador já existe o do próprio navegador).
  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (!standalone) return;
    let startY: number | null = null;
    let dist = 0;
    const onStart = (e: TouchEvent) => {
      startY = window.scrollY <= 0 ? e.touches[0]!.clientY : null;
      dist = 0;
    };
    const onMove = (e: TouchEvent) => {
      if (startY == null) return;
      dist = Math.max(0, e.touches[0]!.clientY - startY);
      setPull(Math.min(dist, PULL_PX * 1.5));
    };
    const onEnd = () => {
      if (startY != null && dist >= PULL_PX) reload();
      startY = null;
      setPull(0);
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
    };
  }, []);

  if (pull < 10) return null;
  const ready = pull >= PULL_PX;
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-2 z-50 flex justify-center"
      style={{ transform: `translateY(${Math.min(pull, PULL_PX) / 2}px)` }}
      aria-hidden
    >
      <span
        className={cn(
          "flex size-10 items-center justify-center rounded-full border bg-surface shadow-lg",
          ready ? "border-brand text-brand" : "border-border text-muted",
        )}
      >
        <RotateCw className="size-5" style={{ transform: `rotate(${(pull / PULL_PX) * 270}deg)` }} />
      </span>
    </div>
  );
}
