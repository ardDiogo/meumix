"use client";

import { ExternalLink, Loader2, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { linkSteamProfile, unlinkSteamProfile } from "@/app/(app)/configuracoes/actions";
import { Avatar } from "../ui/avatar";
import { Button } from "../ui/button";
import { Input, Label } from "../ui/input";

/** Vincula o perfil da Steam colando o link; a foto é importada automaticamente. */
export function SteamLinkForm({
  name,
  avatarUrl,
  steamUrl,
  userId,
  onDone,
}: {
  name: string;
  avatarUrl: string | null;
  steamUrl: string | null;
  /** Só quando um admin edita outro jogador. */
  userId?: string;
  onDone?: () => void;
}) {
  const [value, setValue] = useState("");
  const [current, setCurrent] = useState({ avatarUrl, steamUrl });
  const [pending, start] = useTransition();
  const id = `steam-${userId ?? "me"}`;

  const run = (fn: () => ReturnType<typeof linkSteamProfile>) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(r.message);
        setCurrent({ avatarUrl: r.avatarUrl, steamUrl: r.steamUrl });
        setValue("");
        onDone?.();
      } else toast.error(r.message);
    });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Avatar name={name} src={current.avatarUrl} size="lg" />
        <div className="min-w-0 text-sm">
          <div className="font-medium">{name}</div>
          {current.steamUrl ? (
            <a
              href={current.steamUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted hover:text-brand"
            >
              Perfil Steam <ExternalLink className="size-3" />
            </a>
          ) : (
            <p className="text-xs text-muted">Nenhum perfil Steam vinculado.</p>
          )}
        </div>
      </div>
      <div>
        <Label htmlFor={id}>Link do perfil Steam</Label>
        <div className="flex gap-2">
          <Input
            id={id}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="https://steamcommunity.com/id/seunick"
            autoComplete="off"
          />
          <Button
            variant="primary"
            disabled={pending || !value.trim()}
            onClick={() => run(() => linkSteamProfile(value, userId))}
          >
            {pending ? <Loader2 className="animate-spin" /> : null}
            {current.steamUrl ? "Atualizar" : "Vincular"}
          </Button>
        </div>
        <p className="mt-1.5 text-xs text-subtle">
          Na Steam: clique no seu nome → Perfil → copie o endereço da página. A foto é atualizada quando você vincular
          de novo.
        </p>
      </div>
      {current.steamUrl && (
        <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => unlinkSteamProfile(userId))}>
          <Trash2 /> Remover vínculo
        </Button>
      )}
    </div>
  );
}
