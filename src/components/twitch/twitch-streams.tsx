"use client";

import { ExternalLink, Play } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Avatar } from "../ui/avatar";
import { Card, CardHeader } from "../ui/card";
import { TwitchEmbed } from "./twitch-embed";
import { TwitchIcon } from "./twitch-icon";

export interface StreamItem {
  key: string;
  playerName: string;
  playerHref: string;
  avatarUrl: string | null;
  live: boolean;
  /** Player (sem o parent, acrescentado no navegador). */
  src: string;
  /** Página na Twitch. */
  url: string;
  title: string;
  meta: string;
  /** Miniatura (antes de carregar o player). */
  thumbnailUrl?: string | null;
}

/** Lives ou gravações da Twitch, uma aba por jogador, tocando dentro do site. */
export function TwitchStreams({
  title,
  description,
  items,
  footnote,
  className,
}: {
  title: string;
  description?: string;
  items: StreamItem[];
  footnote?: string;
  className?: string;
}) {
  const [selected, setSelected] = useState(items[0]?.key);
  // O player só carrega ao clicar: canais marcados como conteúdo adulto só tocam para quem
  // está logado na Twitch, e o aviso dela no meio da página parecia erro do site.
  const [playing, setPlaying] = useState<string | null>(null);
  const current = items.find((i) => i.key === selected) ?? items[0];
  if (!current) return null;
  return (
    <Card className={className}>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <TwitchIcon className="size-4 text-[#9146FF]" /> {title}
          </span>
        }
        description={description}
      />
      {items.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto border-b border-border px-4 py-2" role="tablist">
          {items.map((i) => (
            <button
              key={i.key}
              type="button"
              role="tab"
              aria-selected={i.key === current.key}
              onClick={() => setSelected(i.key)}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-md border px-2 py-1 text-sm transition-colors",
                i.key === current.key
                  ? "border-brand/50 bg-brand/10 text-fg"
                  : "border-border bg-surface-2 text-muted hover:text-fg",
              )}
            >
              <Avatar name={i.playerName} src={i.avatarUrl} size="xs" />
              {i.playerName}
              {i.live && <span className="size-2 rounded-full bg-loss" aria-label="ao vivo" />}
            </button>
          ))}
        </div>
      )}
      <div className="mx-auto max-w-4xl p-4">
        {playing === current.key ? (
          <TwitchEmbed key={current.key} src={current.src} title={`${current.playerName} na Twitch`} />
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(current.key)}
            className="group relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-md border border-border bg-gradient-to-br from-[#9146FF]/25 to-bg"
            aria-label={`Assistir ${current.playerName} aqui`}
          >
            {current.thumbnailUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={current.thumbnailUrl}
                alt=""
                className="absolute inset-0 size-full object-cover opacity-70 transition-opacity group-hover:opacity-90"
              />
            )}
            <span className="relative flex flex-col items-center gap-2">
              <span className="flex size-16 items-center justify-center rounded-full bg-[#9146FF] text-white shadow-lg transition-transform group-hover:scale-110">
                <Play className="size-7 translate-x-0.5" fill="currentColor" />
              </span>
              <span className="rounded bg-black/60 px-2 py-0.5 text-sm font-semibold text-white">
                {current.live ? "Assistir a live aqui" : "Assistir aqui"}
              </span>
            </span>
          </button>
        )}
        <div className="mt-3 flex flex-wrap items-start justify-between gap-2 text-sm">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {current.live && (
                <span className="rounded-sm bg-loss px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white uppercase">
                  Ao vivo
                </span>
              )}
              <Link href={current.playerHref} className="font-medium text-brand hover:underline">
                {current.playerName}
              </Link>
              <span className="text-xs text-subtle">{current.meta}</span>
            </div>
            <p className="mt-0.5 truncate text-muted" title={current.title}>
              {current.title}
            </p>
          </div>
          <a
            href={current.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1 text-muted hover:text-brand"
          >
            Abrir na Twitch <ExternalLink className="size-3.5" />
          </a>
        </div>
        {footnote && <p className="mt-3 text-xs text-subtle">{footnote}</p>}
        {playing === current.key && (
          <p className="mt-2 text-xs text-subtle">
            Apareceu “destinado a públicos específicos”? O canal está marcado como conteúdo adulto na Twitch e só toca
            para quem está logado nela: use “Abrir na Twitch”.
          </p>
        )}
      </div>
    </Card>
  );
}
