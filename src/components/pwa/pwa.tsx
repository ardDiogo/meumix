"use client";

import { Download, Share, X } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { installState, promptInstall, serverInstallState, startPwa, subscribeInstall } from "@/lib/pwa-install";
import { Button } from "../ui/button";

const DISMISS_KEY = "meumix:pwa-dismissed";
const DISMISS_DAYS = 30;

function useInstallState() {
  return useSyncExternalStore(subscribeInstall, installState, serverInstallState);
}

/** Registra o service worker (uma vez, no layout raiz). */
export function PwaRegister() {
  useEffect(() => startPwa(), []);
  return null;
}

function dismissedRecently() {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    return Date.now() - at < DISMISS_DAYS * 86_400_000;
  } catch {
    return false;
  }
}

/** Banner "Instale o MeuMix" (Android/Chrome) ou instruções do iPhone; some por 30 dias ao fechar. */
export function InstallBanner() {
  const state = useInstallState();
  const [closed, setClosed] = useState(false);
  const hidden = useSyncExternalStore(
    () => () => {},
    dismissedRecently,
    () => true,
  );
  if (closed || hidden || (state !== "installable" && state !== "ios")) return null;

  const close = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {}
    setClosed(true);
  };

  return (
    <div className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-md rounded-lg border border-t-2 border-border border-t-brand bg-surface p-4 shadow-2xl sm:right-4 sm:left-auto">
      <button
        type="button"
        onClick={close}
        aria-label="Fechar"
        className="absolute top-2 right-2 rounded-md p-1 text-subtle hover:text-fg"
      >
        <X className="size-4" />
      </button>
      <div className="flex items-start gap-3 pr-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/pwa/icon-96.png" alt="" className="size-12 shrink-0 rounded-lg" />
        <div className="min-w-0 text-sm">
          <div className="font-semibold text-fg">Instale o MeuMix</div>
          {state === "installable" ? (
            <p className="mt-0.5 text-muted">Abra direto da tela inicial, em tela cheia, como um app.</p>
          ) : (
            <p className="mt-0.5 text-muted">
              No Safari, toque em{" "}
              <Share className="inline size-4 align-text-bottom text-brand" aria-label="Compartilhar" /> e depois em{" "}
              <strong className="text-fg">Adicionar à Tela de Início</strong>.
            </p>
          )}
        </div>
      </div>
      {state === "installable" && (
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={close}>
            Agora não
          </Button>
          <Button variant="primary" size="sm" onClick={() => promptInstall()}>
            <Download /> Instalar
          </Button>
        </div>
      )}
    </div>
  );
}

/** Link "Instalar app" (rodapé): só aparece quando o navegador permite instalar. */
export function InstallLink({ className }: { className?: string }) {
  const state = useInstallState();
  if (state !== "installable") return null;
  return (
    <button type="button" onClick={() => promptInstall()} className={className}>
      Instalar app
    </button>
  );
}
