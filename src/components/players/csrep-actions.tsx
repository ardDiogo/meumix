"use client";

import { Loader2, Sparkles, Upload } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { analyzeCsrepPrint, saveCsrepLink } from "@/app/(app)/jogadores/[id]/actions";
import { compressImage } from "@/lib/image-client";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

/** Envio do print do CSRep para a IA analisar (dono do perfil ou admin). */
export function CsrepUpload({ userId }: { userId: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          start(async () => {
            try {
              const r = await analyzeCsrepPrint(userId, await compressImage(file, 2000));
              if (r.ok) toast.success(r.message);
              else toast.error(r.message);
            } catch {
              toast.error("Falha ao enviar o print. Tente de novo.");
            }
          });
        }}
      />
      <Button variant="primary" size="sm" disabled={pending} onClick={() => input.current?.click()}>
        {pending ? <Loader2 className="animate-spin" /> : <Sparkles />}
        {pending ? "Analisando… (até 1 min)" : "Analisar print do CSRep"}
      </Button>
    </>
  );
}

export function CsrepLinkForm({ userId, savedUrl }: { userId: string; savedUrl: string | null }) {
  const [value, setValue] = useState(savedUrl ?? "");
  const [pending, start] = useTransition();
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveCsrepLink(userId, value);
          if (r.ok) toast.success(r.message);
          else toast.error(r.message);
        });
      }}
    >
      <Input
        aria-label="Link do CSRep"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="https://csrep.gg/player/76561198…"
        className="h-8 text-xs"
      />
      <Button type="submit" variant="secondary" size="sm" disabled={pending || value === (savedUrl ?? "")}>
        {pending ? <Loader2 className="animate-spin" /> : <Upload />} Salvar
      </Button>
    </form>
  );
}
