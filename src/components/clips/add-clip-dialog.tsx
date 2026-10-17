"use client";

import { Loader2, Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { addClip } from "@/app/(app)/clipes/actions";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogTrigger } from "../ui/dialog";
import { Input, Label, Select } from "../ui/input";
import { CLIP_KINDS } from "./clip-card";

interface Option {
  id: string;
  label: string;
}

/** Enviar clipe do Allstar: link, título, tipo, mix e (admins) o jogador. */
export function AddClipDialog({
  mixes,
  players,
  currentUserId,
  defaultMixId,
}: {
  mixes: Option[];
  /** Só para administradores (enviar em nome de outro jogador). */
  players: Option[] | null;
  currentUserId: string;
  defaultMixId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("clip");
  const [mixId, setMixId] = useState(defaultMixId ?? "");
  const [userId, setUserId] = useState(currentUserId);
  const [pending, start] = useTransition();

  const submit = () =>
    start(async () => {
      const r = await addClip({ url, title, kind, matchId: mixId || null, userId });
      if (r.ok) {
        toast.success(r.message);
        setUrl("");
        setTitle("");
        setOpen(false);
      } else toast.error(r.message);
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="primary">
          <Plus /> Enviar clipe
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Enviar clipe do Allstar"
        description="No Allstar, abra o clipe → Share → Copy Link e cole aqui."
      >
        <div className="space-y-3">
          <div>
            <Label htmlFor="clip-url">Link do clipe</Label>
            <Input
              id="clip-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://allstar.gg/clip/6acd4a55f20f64fba59f5dfc…"
              autoComplete="off"
            />
          </div>
          <div>
            <Label htmlFor="clip-title">Título</Label>
            <Input
              id="clip-title"
              value={title}
              maxLength={80}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Inferno 1v4 Ace Clutch"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="clip-kind">Tipo</Label>
              <Select id="clip-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
                {Object.entries(CLIP_KINDS).map(([value, k]) => (
                  <option key={value} value={value}>
                    {k.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="clip-mix">Mix</Label>
              <Select id="clip-mix" value={mixId} onChange={(e) => setMixId(e.target.value)}>
                <option value="">Sem mix</option>
                {mixes.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          {players && (
            <div>
              <Label htmlFor="clip-player">Jogador</Label>
              <Select id="clip-player" value={userId} onChange={(e) => setUserId(e.target.value)}>
                {players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </div>
          )}
        </div>
        <div className="mt-5 flex justify-end">
          <Button variant="primary" disabled={pending || !url.trim() || title.trim().length < 2} onClick={submit}>
            {pending && <Loader2 className="animate-spin" />} Enviar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
