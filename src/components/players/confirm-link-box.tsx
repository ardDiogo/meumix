"use client";

import { Copy, Loader2, MessageCircle, RefreshCw } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import type { ConfirmLinkResult } from "@/app/(app)/admin/user-actions";
import { confirmLinkMessage } from "@/lib/confirm-link-message";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

/**
 * Mostra o link pessoal de confirmação (sem login), com copiar, enviar no
 * WhatsApp e gerar um novo (o antigo deixa de funcionar).
 */
export function ConfirmLinkBox({
  load,
  name,
}: {
  load: (rotate: boolean) => Promise<ConfirmLinkResult>;
  name?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [pending, start] = useTransition();

  const fetchLink = (rotate: boolean) =>
    start(async () => {
      let r: ConfirmLinkResult;
      try {
        r = await load(rotate);
      } catch {
        r = { ok: false, message: "Não foi possível carregar o link." };
      }
      if (r.ok) {
        setUrl(r.url);
        setError(null);
        if (r.message) toast.success(r.message);
      } else setError(r.message);
      setConfirmRotate(false);
    });

  useEffect(() => {
    fetchLink(false);
    // Carrega uma vez ao abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const message = url ? confirmLinkMessage(url, name) : "";

  if (error) return <p className="text-sm text-loss">{error}</p>;
  if (!url) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted">
        <Loader2 className="size-4 animate-spin" /> Carregando link…
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input value={url} readOnly className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
        <Button
          variant="secondary"
          aria-label="Copiar link"
          onClick={() => {
            void navigator.clipboard
              ?.writeText(url)
              .then(() => toast.success("Link copiado."))
              .catch(() => toast.error("Não foi possível copiar."));
          }}
        >
          <Copy />
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" asChild>
          <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer">
            <MessageCircle /> Enviar no WhatsApp
          </a>
        </Button>
        {confirmRotate ? (
          <>
            <Button variant="danger" disabled={pending} onClick={() => fetchLink(true)}>
              {pending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Sim, gerar novo
            </Button>
            <Button variant="secondary" disabled={pending} onClick={() => setConfirmRotate(false)}>
              Cancelar
            </Button>
          </>
        ) : (
          <Button variant="outline" disabled={pending} onClick={() => setConfirmRotate(true)}>
            <RefreshCw /> Gerar novo link
          </Button>
        )}
      </div>
      <p className="text-xs text-subtle">
        {confirmRotate
          ? "O link atual para de funcionar, inclusive nos celulares que já estavam lembrados."
          : "Quem tiver este link confirma presença no nome do jogador (não acessa a conta). Se vazar, gere um novo."}
      </p>
    </div>
  );
}
