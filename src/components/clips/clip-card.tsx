"use client";

import { Clapperboard, ExternalLink, Flame, Loader2, Play, ShieldCheck, Sparkles, Trash2, Zap } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteClip } from "@/app/(app)/clipes/actions";
import { formatDate } from "@/lib/format";
import type { HighlightKind } from "@/types/domain";
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
  title: string;
  url: string | null;
  embedUrl: string | null;
  createdAt: string;
  player: { name: string; href: string } | null;
  mix: { name: string; href: string } | null;
  canDelete: boolean;
}

/** Cartão do clipe: o vídeo abre numa janela dentro do site (player do Allstar). */
export function ClipCard({ clip }: { clip: ClipView }) {
  const k = CLIP_KINDS[clip.kind];
  const Icon = k.icon;
  const [deleting, startDelete] = useTransition();
  const [confirm, setConfirm] = useState(false);

  return (
    <Card className="flex h-full flex-col overflow-hidden">
      <Dialog>
        <DialogTrigger asChild>
          <button
            type="button"
            disabled={!clip.embedUrl && !clip.url}
            className="group relative flex aspect-video items-center justify-center border-b border-border bg-gradient-to-br from-surface-2 to-bg"
            aria-label={`Assistir: ${clip.title}`}
          >
            <Icon className="absolute top-3 left-3 size-5 text-subtle" />
            <span className="flex size-14 items-center justify-center rounded-full bg-brand text-white shadow-lg transition-transform group-hover:scale-110">
              <Play className="size-6 translate-x-0.5" fill="currentColor" />
            </span>
          </button>
        </DialogTrigger>
        <DialogContent title={clip.title} className="max-w-4xl">
          {clip.embedUrl && (
            <div className="aspect-video w-full overflow-hidden rounded-md border border-border bg-black">
              <iframe
                src={clip.embedUrl}
                title={clip.title}
                className="size-full"
                allow="autoplay; fullscreen; picture-in-picture"
                allowFullScreen
              />
            </div>
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
                Não carregou? Abrir no Allstar <ExternalLink className="size-3.5" />
              </a>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <div className="flex flex-1 flex-col gap-1 p-4">
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
                className="ml-auto text-subtle hover:text-loss"
                onClick={() => setConfirm(true)}
              >
                <Trash2 className="size-4" />
              </button>
            ))}
        </div>
        <div className="mt-1 font-medium">
          {clip.player && (
            <>
              <Link href={clip.player.href} className="text-brand hover:underline">
                {clip.player.name}
              </Link>{" "}
              —{" "}
            </>
          )}
          {clip.title}
        </div>
        {clip.mix && (
          <Link href={clip.mix.href} className="text-sm text-muted hover:text-fg">
            {clip.mix.name}
          </Link>
        )}
      </div>
    </Card>
  );
}
