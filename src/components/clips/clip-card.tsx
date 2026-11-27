"use client";

import { Clapperboard, ExternalLink, Flame, Loader2, Play, ShieldCheck, Sparkles, Trash2, Zap } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteClip } from "@/app/(app)/clipes/actions";
import { formatDate } from "@/lib/format";
import type { ClipMeta } from "@/lib/clip-meta";
import { mapName } from "@/lib/maps";
import { cn } from "@/lib/utils";
import type { HighlightKind } from "@/types/domain";
import { MapIcon } from "../maps/map-icon";
import { TwitchEmbed } from "../twitch/twitch-embed";
import { TwitchIcon } from "../twitch/twitch-icon";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Dialog, DialogContent, DialogTrigger } from "../ui/dialog";

export const CLIP_KINDS: Record<HighlightKind, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  ace: { label: "Ace", icon: Flame },
  clutch: { label: "Clutch", icon: ShieldCheck },
  multikill: { label: "Multikill", icon: Zap },
  clip: { label: "Clipe", icon: Clapperboard },
  other: { label: "Destaque", icon: Sparkles },
};

export interface ClipView {
  id: string;
  kind: HighlightKind;
  /** Mapa, arma, situação e abates tirados do título. */
  meta: ClipMeta;
  playerId: string | null;
  title: string;
  url: string | null;
  embedUrl: string | null;
  source: "allstar" | "twitch";
  videoUrl: string | null;
  thumbnailUrl: string | null;
  createdAt: string;
  player: { name: string; href: string } | null;
  mix: { id: string; name: string; href: string; date: string } | null;
  canDelete: boolean;
}

/** Cartão do clipe: o vídeo abre numa janela dentro do site (player do Allstar ou da Twitch). */
export function ClipCard({ clip, featured = false }: { clip: ClipView; featured?: boolean }) {
  const k = CLIP_KINDS[clip.kind];
  const Icon = k.icon;
  const [deleting, startDelete] = useTransition();
  const [confirm, setConfirm] = useState(false);

  return (
    <Card
      className={cn(
        "group/card flex h-full flex-col overflow-hidden",
        featured && "border-brand/50 shadow-[0_0_28px_-10px] shadow-brand/60 md:grid md:grid-cols-[3fr_2fr]",
      )}
    >
      <Dialog>
        <DialogTrigger asChild>
          <button
            type="button"
            disabled={!clip.embedUrl && !clip.url && !clip.videoUrl}
            className={cn(
              "group relative flex aspect-video items-center justify-center overflow-hidden border-b border-border bg-gradient-to-br from-surface-2 to-bg",
              featured && "md:border-r md:border-b-0",
            )}
            aria-label={`Assistir: ${clip.title}`}
          >
            {/* Sem miniatura: o emblema do mapa, grande e apagado, no fundo. */}
            {!clip.thumbnailUrl && clip.meta.mapId && (
              <span className="absolute inset-0 flex items-center justify-center" aria-hidden>
                <MapIcon id={clip.meta.mapId} size={featured ? 220 : 150} className="opacity-45" />
              </span>
            )}
            {/* Nem miniatura nem mapa: o ícone do tipo, grande e apagado. */}
            {!clip.thumbnailUrl && !clip.meta.mapId && (
              <Icon className={cn("absolute text-brand/10", featured ? "size-48" : "size-32")} aria-hidden />
            )}
            {clip.thumbnailUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={clip.thumbnailUrl}
                alt=""
                loading="lazy"
                className="absolute inset-0 size-full object-cover opacity-80 transition-opacity group-hover:opacity-100"
              />
            )}
            <Icon className="absolute top-3 left-3 size-5 text-subtle drop-shadow" />
            {clip.source === "twitch" && (
              <TwitchIcon className="absolute top-3 right-3 size-5 text-[#9146FF] drop-shadow" />
            )}
            <span className="relative flex size-14 items-center justify-center rounded-full bg-brand text-white shadow-lg transition-transform group-hover:scale-110">
              <Play className="size-6 translate-x-0.5" fill="currentColor" />
            </span>
          </button>
        </DialogTrigger>
        <DialogContent title={clip.title} className="max-w-4xl">
          {clip.videoUrl ? (
            <video
              src={clip.videoUrl}
              poster={clip.thumbnailUrl ?? undefined}
              controls
              autoPlay
              playsInline
              className="aspect-video w-full rounded-md border border-border bg-black"
            />
          ) : clip.source === "twitch" && clip.embedUrl ? (
            <TwitchEmbed src={`${clip.embedUrl}&autoplay=true`} title={clip.title} />
          ) : (
            clip.embedUrl && (
              <div className="aspect-video w-full overflow-hidden rounded-md border border-border bg-black">
                <iframe
                  src={clip.embedUrl}
                  title={clip.title}
                  className="size-full"
                  allow="autoplay; fullscreen; picture-in-picture"
                  allowFullScreen
                />
              </div>
            )
          )}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-muted">
              {clip.player?.name}
              {clip.mix && ` · ${clip.mix.name}`}
            </span>
            {clip.url && (
              <a
                href={clip.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-muted hover:text-brand"
              >
                Não carregou? Abrir {clip.source === "twitch" ? "na Twitch" : "no Allstar"}{" "}
                <ExternalLink className="size-3.5" />
              </a>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <div className={cn("flex flex-1 flex-col gap-1 p-4", featured && "md:justify-center md:p-6")}>
        {featured && (
          <div className="mb-1 text-[11px] font-bold tracking-[0.2em] text-brand uppercase">Clipe em destaque</div>
        )}
        <div className="flex items-center gap-2">
          <Badge variant={clip.kind === "ace" ? "brand" : "neutral"}>{k.label}</Badge>
          <span className="text-xs text-subtle">{formatDate(clip.createdAt)}</span>
          {clip.canDelete &&
            (confirm ? (
              <span className="ml-auto flex gap-1">
                <Button
                  variant="danger"
                  size="sm"
                  disabled={deleting}
                  onClick={() =>
                    startDelete(async () => {
                      const r = await deleteClip(clip.id);
                      if (r.ok) toast.success(r.message);
                      else toast.error(r.message);
                      setConfirm(false);
                    })
                  }
                >
                  {deleting && <Loader2 className="animate-spin" />} Excluir
                </Button>
                <Button variant="secondary" size="sm" disabled={deleting} onClick={() => setConfirm(false)}>
                  Não
                </Button>
              </span>
            ) : (
              <button
                type="button"
                aria-label="Excluir clipe"
                // Discreta: no computador só aparece ao passar o mouse no cartão.
                className="ml-auto text-subtle transition-opacity hover:text-loss focus:opacity-100 sm:opacity-0 sm:group-hover/card:opacity-100"
                onClick={() => setConfirm(true)}
              >
                <Trash2 className="size-4" />
              </button>
            ))}
        </div>
        {clip.player && (
          <Link
            href={clip.player.href}
            className={cn("mt-1 font-semibold text-brand hover:underline", featured && "text-lg")}
          >
            {clip.player.name}
          </Link>
        )}
        <div className={cn("text-sm text-fg", !clip.player && "mt-1 font-medium", featured && "md:text-base")}>
          {clip.title}
        </div>
        {(clip.meta.mapId || clip.meta.weapon || clip.meta.situation || clip.meta.kills) && (
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
            {clip.meta.mapId && (
              <span className="inline-flex items-center gap-1 rounded border border-border bg-surface-2 px-1.5 py-0.5">
                <MapIcon id={clip.meta.mapId} size={13} />
                {mapName(clip.meta.mapId)}
              </span>
            )}
            {clip.meta.weapon && (
              <span className="rounded border border-border bg-surface-2 px-1.5 py-0.5">{clip.meta.weapon}</span>
            )}
            {clip.meta.situation && (
              <span className="rounded border border-sky-500/40 bg-sky-500/10 px-1.5 py-0.5 font-semibold text-sky-300">
                {clip.meta.situation}
              </span>
            )}
            {clip.meta.kills && (
              <span className="rounded border border-brand/40 bg-brand/10 px-1.5 py-0.5 font-semibold text-brand">
                {clip.meta.kills}
              </span>
            )}
          </div>
        )}
        {clip.mix && (
          <Link href={clip.mix.href} className="text-sm text-muted hover:text-fg">
            {clip.mix.name}
          </Link>
        )}
      </div>
    </Card>
  );
}
