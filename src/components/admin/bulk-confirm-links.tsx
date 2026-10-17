"use client";

import { Check, Copy, Link2, Loader2, MessageCircle } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { listConfirmLinks, type ConfirmLinksResult } from "@/app/(app)/admin/user-actions";
import { confirmLinkMessage } from "@/lib/confirm-link-message";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogTrigger } from "../ui/dialog";

/** Mensagem com o link pessoal de cada jogador, pronta para enviar no privado. */
export function BulkConfirmLinks() {
  const [result, setResult] = useState<ConfirmLinksResult | null>(null);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();

  const load = () =>
    start(async () => {
      try {
        setResult(await listConfirmLinks());
      } catch {
        setResult({ ok: false, message: "Não foi possível carregar os links." });
      }
    });

  const copy = (text: string, label: string) =>
    void navigator.clipboard
      ?.writeText(text)
      .then(() => toast.success(label))
      .catch(() => toast.error("Não foi possível copiar."));

  const markSent = (id: string) => setSent((s) => new Set(s).add(id));

  return (
    <Dialog onOpenChange={(open) => open && load()}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Link2 /> Links pessoais
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Links pessoais de todos os jogadores"
        description="Envie cada mensagem no privado do jogador (nunca no grupo). Em “WhatsApp”, escolha o contato e envie."
        className="max-w-2xl"
      >
        {pending || !result ? (
          <p className="flex items-center gap-2 text-sm text-muted">
            <Loader2 className="size-4 animate-spin" /> Gerando links…
          </p>
        ) : !result.ok ? (
          <p className="text-sm text-loss">{result.message}</p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm text-muted">
                {sent.size}/{result.links.length} enviados
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  copy(
                    result.links.map((l) => `*${l.name}*\n${confirmLinkMessage(l.url, l.name)}`).join("\n\n-----\n\n"),
                    "Todas as mensagens copiadas.",
                  )
                }
              >
                <Copy /> Copiar todas
              </Button>
            </div>
            <ul className="max-h-[60vh] divide-y divide-border overflow-y-auto rounded-md border border-border">
              {result.links.map((l) => {
                const message = confirmLinkMessage(l.url, l.name);
                const done = sent.has(l.userId);
                return (
                  <li key={l.userId} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 font-medium">
                        {done && <Check className="size-4 text-win" aria-label="Enviado" />}
                        {l.name}
                      </div>
                      <div className="truncate font-mono text-xs text-subtle">{l.url}</div>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      aria-label={`Copiar mensagem de ${l.name}`}
                      onClick={() => {
                        copy(message, `Mensagem de ${l.name} copiada.`);
                        markSent(l.userId);
                      }}
                    >
                      <Copy />
                    </Button>
                    <Button variant="primary" size="sm" asChild>
                      <a
                        href={`https://wa.me/?text=${encodeURIComponent(message)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => markSent(l.userId)}
                      >
                        <MessageCircle /> WhatsApp
                      </a>
                    </Button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
