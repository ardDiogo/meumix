"use client";

import { Bell, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { currentSubscription, pushSupport } from "@/lib/push-client";
import { Button } from "../ui/button";

const DISMISS_KEY = "meumix:push-dismissed";
const DISMISS_DAYS = 30;

/** Convite discreto para ativar os avisos (some se já ativou ou fechou há menos de 30 dias). */
export function PushPrompt() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (Date.now() - Number(localStorage.getItem(DISMISS_KEY) ?? 0) < DISMISS_DAYS * 86_400_000) return;
      } catch {}
      const support = pushSupport();
      if (support === "unsupported" || support === "denied") return;
      if (support === "supported" && (await currentSubscription().catch(() => null))) return;
      if (alive) setShow(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!show) return null;
  const close = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {}
    setShow(false);
  };
  return (
    <div className="mb-4 flex items-center gap-3 rounded-lg border border-brand/30 bg-brand/8 px-4 py-3">
      <Bell className="size-5 shrink-0 text-brand" aria-hidden />
      <p className="min-w-0 flex-1 text-sm">
        <span className="font-semibold">Ative os avisos no celular:</span>{" "}
        <span className="text-muted">lista abrindo, PICK, bolão e seu ELO depois do mix.</span>
      </p>
      <Button variant="primary" size="sm" asChild>
        <Link href="/configuracoes#avisos">Ativar</Link>
      </Button>
      <button type="button" onClick={close} aria-label="Fechar" className="rounded-md p-1 text-subtle hover:text-fg">
        <X className="size-4" />
      </button>
    </div>
  );
}
