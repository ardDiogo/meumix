"use client";

import { Check, Copy, MessageCircle, Share2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogTrigger } from "../ui/dialog";

/** Compartilha o convite do mix no WhatsApp (ou copia o texto). */
export function ShareMixButton({ message }: { message: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      toast.success("Convite copiado!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Não foi possível copiar. Selecione o texto manualmente.");
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="Compartilhar mix">
          <Share2 /> <span className="hidden sm:inline">Compartilhar</span>
        </Button>
      </DialogTrigger>
      <DialogContent title="Compartilhar mix" description="Envie o convite com o link para a galera se inscrever.">
        <pre className="max-h-72 overflow-y-auto rounded-md border border-border bg-surface-2 p-4 font-sans text-sm leading-relaxed whitespace-pre-wrap text-fg">
          {message.replace(/\*/g, "")}
        </pre>
        <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]">
          <Button variant="primary" size="lg" asChild>
            <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer">
              <MessageCircle /> Compartilhar no WhatsApp
            </a>
          </Button>
          <Button variant="secondary" size="lg" onClick={copy}>
            {copied ? <Check /> : <Copy />} {copied ? "Copiado" : "Copiar texto"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
