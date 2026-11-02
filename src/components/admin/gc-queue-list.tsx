"use client";

import { ExternalLink, X } from "lucide-react";
import type { GcQueued } from "@/lib/gc-queue";
import { removeFromGcQueue } from "@/lib/gc-queue";
import { Select } from "../ui/input";

/**
 * Mapas recebidos da GC, na ordem do envio. Na finalização, cada um ganha a
 * escolha do mapa (vem sugerido pelo título do clipe ou pela página).
 */
export function GcQueueList({
  queue,
  maps,
  mapOf,
  onMapChange,
}: {
  queue: GcQueued[];
  maps?: { id: string; name: string }[];
  mapOf?: (index: number) => string;
  onMapChange?: (index: number, mapId: string) => void;
}) {
  if (!queue.length)
    return (
      <p className="rounded-md border border-dashed border-border-strong px-4 py-6 text-center text-sm text-muted">
        Nenhum mapa recebido ainda.
      </p>
    );
  return (
    <ol className="space-y-1.5">
      {queue.map((q, i) => (
        <li
          key={`${q.map.gcMatchId}-${i}`}
          className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md bg-surface-2 px-3 py-2 text-sm"
        >
          <span className="text-xs font-semibold text-muted">Mapa {i + 1}</span>
          {maps && mapOf && onMapChange ? (
            <Select
              aria-label={`Mapa ${i + 1}`}
              value={mapOf(i)}
              onChange={(e) => onMapChange(i, e.target.value)}
              className="h-8 w-36"
            >
              <option value="">Escolha o mapa</option>
              {maps.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          ) : (
            <span className="font-medium">{q.map.mapHint ?? "Mapa a confirmar"}</span>
          )}
          <span className="font-display font-bold tabular">
            {q.map.scoreA} × {q.map.scoreB}
          </span>
          <span className="text-xs text-muted">{q.map.players.length} jogadores</span>
          {q.map.gcMatchId && (
            <a
              href={`https://gamersclub.com.br/lobby/match/${q.map.gcMatchId}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted hover:text-brand"
            >
              GC #{q.map.gcMatchId} <ExternalLink className="size-3" />
            </a>
          )}
          <button
            type="button"
            aria-label={`Remover mapa ${i + 1}`}
            onClick={() => removeFromGcQueue(i)}
            className="ml-auto text-muted hover:text-loss"
          >
            <X className="size-4" />
          </button>
        </li>
      ))}
    </ol>
  );
}
