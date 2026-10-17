"use client";

import { ExternalLink, Loader2, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setTwitchChannel } from "@/app/(app)/configuracoes/actions";
import { twitchChannelUrl } from "@/lib/twitch";
import { TwitchIcon } from "../twitch/twitch-icon";
import { Button } from "../ui/button";
import { Input, Label } from "../ui/input";

/** Canal da Twitch do jogador: aparece ao vivo no site e nas transmissões dos mixes. */
export function TwitchLinkForm({ login }: { login: string | null }) {
  const [value, setValue] = useState("");
  const [current, setCurrent] = useState(login);
  const [pending, start] = useTransition();

  const save = (input: string) =>
    start(async () => {
      const r = await setTwitchChannel(input);
      if (r.ok) {
        toast.success(r.message);
        setCurrent(r.login);
        setValue("");
      } else toast.error(r.message);
    });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm">
        <TwitchIcon className="size-5 text-[#9146FF]" />
        {current ? (
          <a
            href={twitchChannelUrl(current)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-medium hover:text-brand"
          >
            twitch.tv/{current} <ExternalLink className="size-3" />
          </a>
        ) : (
          <span className="text-muted">Nenhum canal cadastrado.</span>
        )}
      </div>
      <div>
        <Label htmlFor="twitch-me">Link do canal</Label>
        <div className="flex gap-2">
          <Input
            id="twitch-me"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="https://www.twitch.tv/seucanal"
            autoComplete="off"
          />
          <Button variant="primary" disabled={pending || !value.trim()} onClick={() => save(value)}>
            {pending ? <Loader2 className="animate-spin" /> : null}
            {current ? "Atualizar" : "Salvar"}
          </Button>
        </div>
      </div>
      {current && (
        <Button variant="ghost" size="sm" disabled={pending} onClick={() => save("")}>
          <Trash2 /> Remover canal
        </Button>
      )}
    </div>
  );
}
