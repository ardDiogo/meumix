"use client";

import { useSyncExternalStore } from "react";
import { withTwitchParent } from "@/lib/twitch";
import { cn } from "@/lib/utils";

const subscribe = () => () => {};

/**
 * Player da Twitch (live, gravação ou clipe) tocando dentro do site.
 * A Twitch exige o domínio da página no endereço, então só monta no navegador.
 */
export function TwitchEmbed({ src, title, className }: { src: string; title: string; className?: string }) {
  const host = useSyncExternalStore(
    subscribe,
    () => window.location.hostname,
    () => null,
  );
  return (
    <div className={cn("aspect-video w-full overflow-hidden rounded-md border border-border bg-black", className)}>
      {host && (
        <iframe
          src={withTwitchParent(src, host)}
          title={title}
          className="size-full"
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
        />
      )}
    </div>
  );
}
