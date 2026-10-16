"use client";

import { Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveMusic } from "@/app/(app)/admin/config-actions";
import { Button } from "../ui/button";
import { Input, Label } from "../ui/input";
import { Switch } from "../ui/switch";

export function MusicSettings({ enabled, url }: { enabled: boolean; url: string | null }) {
  const [on, setOn] = useState(enabled);
  const [link, setLink] = useState(url ?? "");
  const [pending, start] = useTransition();
  const save = (nextOn: boolean) =>
    start(async () => {
      const r = await saveMusic(nextOn, link);
      if (r.ok) {
        setOn(nextOn);
        toast.success(r.message);
      } else toast.error(r.message);
    });

  return (
    <div className="space-y-4 px-4 pb-4">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="font-medium">Ativar música ao abrir o site</div>
          <div className="text-sm text-muted">
            Quando ativada, todos os usuários ouvirão a música ao acessar o site (com botão para silenciar).
          </div>
        </div>
        <Switch label="Música de fundo" checked={on} pending={pending} onChange={save} />
      </div>
      <div>
        <Label htmlFor="music-url">Link da música (arquivo .mp3)</Label>
        <div className="flex gap-2">
          <Input
            id="music-url"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://…/musica.mp3"
            autoComplete="off"
          />
          <Button variant="outline" disabled={pending || link === (url ?? "")} onClick={() => save(on)}>
            {pending && <Loader2 className="animate-spin" />} Salvar link
          </Button>
        </div>
        <p className="mt-1.5 text-xs text-subtle">
          Use o link direto de um arquivo de áudio (ex.: hospedado no Supabase Storage). YouTube e Spotify não tocam
          direto no site.
        </p>
      </div>
    </div>
  );
}
