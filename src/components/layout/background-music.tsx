"use client";

import { Volume2, VolumeX } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

const MUTE_KEY = "mm-music-muted";

function readMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Música de fundo ligada no admin (seção 10). Toca em loop; se o navegador
 * bloquear o autoplay, começa no primeiro clique/toque. Silenciar fica salvo
 * neste navegador.
 */
export function BackgroundMusic({ url }: { url: string }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [muted, setMuted] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const a = new Audio(url);
    a.loop = true;
    a.volume = 0.25;
    audio.current = a;
    const startMuted = readMuted();
    const timer = setTimeout(() => {
      setMuted(startMuted);
      setReady(true);
    });

    const unlock = () => {
      if (!readMuted()) void a.play().catch(() => {});
      cleanup();
    };
    const cleanup = () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
    if (!startMuted) {
      a.play().catch(() => {
        window.addEventListener("pointerdown", unlock, { once: true });
        window.addEventListener("keydown", unlock, { once: true });
      });
    }
    return () => {
      clearTimeout(timer);
      cleanup();
      a.pause();
      a.src = "";
    };
  }, [url]);

  const toggle = () => {
    const a = audio.current;
    const next = !muted;
    setMuted(next);
    try {
      localStorage.setItem(MUTE_KEY, next ? "1" : "0");
    } catch {}
    if (!a) return;
    if (next) a.pause();
    else void a.play().catch(() => {});
  };

  if (!ready) return null;
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={muted ? "Ligar música de fundo" : "Silenciar música de fundo"}
      title={muted ? "Ligar música" : "Silenciar música"}
      className="fixed right-4 bottom-4 z-40 flex size-11 items-center justify-center rounded-full border border-border bg-surface/90 text-muted shadow-lg shadow-black/40 backdrop-blur transition-colors hover:text-brand"
    >
      {muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5 text-brand" />}
    </button>
  );
}

/** Atualiza a página quando o admin liga/desliga a música (até em abas já abertas). */
export function MusicSettingsWatcher() {
  const router = useRouter();
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const channel = supabase
      .channel("app-settings")
      .on("postgres_changes", { event: "*", schema: "public", table: "feature_settings" }, () => router.refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "app_settings" }, () => router.refresh())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [router]);
  return null;
}
