"use client";

import { useState } from "react";
import { mapIcon, mapName } from "@/lib/maps";
import { cn } from "@/lib/utils";
import type { MapId } from "@/types/domain";

/** Emblema do mapa; sem emblema, mostra a sigla num círculo. */
export function MapIcon({ id, size = 24, className }: { id: MapId; size?: number; className?: string }) {
  const src = mapIcon(id);
  const name = mapName(id);
  // Se o emblema não carregar (ex.: CDN fora do ar), mostra a sigla.
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <span
        aria-hidden
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-full bg-surface-2 text-[10px] font-bold text-muted",
          className,
        )}
        style={{ width: size, height: size }}
      >
        {name.slice(0, 2).toUpperCase()}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      aria-hidden
      loading="lazy"
      onError={() => setFailed(true)}
      width={size}
      height={Math.round(size * 0.77)}
      className={cn("inline-block shrink-0 object-contain", className)}
      style={{ width: size, height: size }}
    />
  );
}
