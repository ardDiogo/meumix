"use client";

import { Copy, Eye, EyeOff, Loader2, Pencil, Plus, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { regenerateChronicle, saveChronicle, setChronicleHidden } from "@/app/(app)/mixes/chronicle-actions";
import type { Chronicle } from "@/lib/chronicle";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogTrigger } from "../ui/dialog";
import { Input, Label, Textarea } from "../ui/input";

type Result = { ok: boolean; message: string };

function useAction() {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<Result>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(r.message);
        after?.();
      } else toast.error(r.message);
    });
  return [pending, run] as const;
}

/** Copia a crônica no formato do WhatsApp. */
export function CopyChronicle({ text }: { text: string }) {
  const copy = async () => {
    const full = `${text}\n${window.location.href.split("?")[0]}`;
    try {
      await navigator.clipboard.writeText(full);
      toast.success("Crônica copiada. É só colar no grupo.");
    } catch {
      toast.error("Não foi possível copiar.");
    }
  };
  return (
    <Button variant="outline" size="sm" onClick={copy}>
      <Copy /> Copiar para o WhatsApp
    </Button>
  );
}

/** Mix sem crônica (antigo ou a IA ainda não terminou): o admin gera na hora. */
export function GenerateChronicle({ matchId }: { matchId: string }) {
  const [pending, run] = useAction();
  return (
    <Button variant="primary" size="sm" disabled={pending} onClick={() => run(() => regenerateChronicle(matchId))}>
      {pending ? <Loader2 className="animate-spin" /> : <Sparkles />} {pending ? "Escrevendo…" : "Gerar crônica"}
    </Button>
  );
}

/** Ações do admin: gerar de novo, editar e ocultar/mostrar. */
export function ChronicleAdmin({
  matchId,
  chronicle,
  hidden,
}: {
  matchId: string;
  chronicle: Chronicle;
  hidden: boolean;
}) {
  const [pending, run] = useAction();
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => run(() => regenerateChronicle(matchId))}
        title="Escreve uma versão nova"
      >
        {pending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Gerar de novo
      </Button>
      <EditChronicle matchId={matchId} chronicle={chronicle} />
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => run(() => setChronicleHidden(matchId, !hidden))}
      >
        {hidden ? <Eye /> : <EyeOff />} {hidden ? "Mostrar" : "Ocultar"}
      </Button>
    </>
  );
}

function EditChronicle({ matchId, chronicle }: { matchId: string; chronicle: Chronicle }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(chronicle);
  const [pending, run] = useAction();
  const setItem = (i: number, patch: Partial<Chronicle["items"][number]>) =>
    setDraft((d) => ({ ...d, items: d.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) }));

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setDraft(chronicle);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Pencil /> Editar
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Editar crônica"
        description="Use *texto* para negrito, como no WhatsApp."
        className="max-w-2xl"
      >
        <div className="max-h-[65vh] space-y-3 overflow-y-auto pr-1">
          <div>
            <Label htmlFor="cr-headline">Subtítulo</Label>
            <Input
              id="cr-headline"
              value={draft.headline}
              maxLength={60}
              onChange={(e) => setDraft({ ...draft, headline: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="cr-intro">Abertura</Label>
            <Textarea
              id="cr-intro"
              value={draft.intro}
              maxLength={400}
              onChange={(e) => setDraft({ ...draft, intro: e.target.value })}
            />
          </div>
          {draft.items.map((it, i) => (
            <div key={i} className="space-y-1.5 rounded-md border border-border p-2">
              <div className="flex gap-2">
                <Input
                  aria-label="Emoji"
                  value={it.emoji}
                  maxLength={8}
                  className="w-14 text-center"
                  onChange={(e) => setItem(i, { emoji: e.target.value })}
                />
                <Input
                  aria-label="Título"
                  value={it.title}
                  maxLength={70}
                  onChange={(e) => setItem(i, { title: e.target.value })}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Remover tópico"
                  onClick={() => setDraft({ ...draft, items: draft.items.filter((_, j) => j !== i) })}
                >
                  <Trash2 />
                </Button>
              </div>
              <Textarea
                aria-label="Texto"
                value={it.text}
                maxLength={320}
                onChange={(e) => setItem(i, { text: e.target.value })}
              />
            </div>
          ))}
          {draft.items.length < 8 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDraft({ ...draft, items: [...draft.items, { emoji: "🔥", title: "", text: "" }] })}
            >
              <Plus /> Adicionar tópico
            </Button>
          )}
          <div>
            <Label htmlFor="cr-closing">Fechamento</Label>
            <Textarea
              id="cr-closing"
              value={draft.closing}
              maxLength={300}
              onChange={(e) => setDraft({ ...draft, closing: e.target.value })}
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            disabled={pending}
            onClick={() =>
              run(
                () => saveChronicle(matchId, draft),
                () => setOpen(false),
              )
            }
          >
            {pending && <Loader2 className="animate-spin" />} Salvar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
