import Link from "next/link";
import { mapName } from "@/lib/maps";
import { mixHref } from "@/lib/mix-slug";
import type { MapRecord, TimelineMix } from "@/lib/player-form";
import { cn } from "@/lib/utils";
import { Card, CardHeader } from "../ui/card";
import { MapIcon } from "@/components/maps/map-icon";

/** Linha do tempo por mapa dos últimos mixes: emblema, ponto verde/vermelho e placar. */
export function RecentMatches({ timeline }: { timeline: TimelineMix[] }) {
  // Últimos ~15 mapas, sem cortar um mix ao meio.
  const shown: TimelineMix[] = [];
  let count = 0;
  for (const mix of [...timeline].reverse()) {
    if (count && count + mix.maps.length > 15) break;
    shown.unshift(mix);
    count += mix.maps.length;
  }
  if (!shown.length) return null;
  return (
    <Card className="mt-4">
      <CardHeader
        title="Partidas"
        description={`Últimos ${count} mapas (${shown.length} ${shown.length > 1 ? "mixes" : "mix"}), do mais antigo ao mais recente`}
      />
      <div className="overflow-x-auto px-4 pt-4 pb-4">
        <ol className="flex min-w-max items-stretch">
          {shown.map((mix, mi) => (
            <li
              key={mix.mixId}
              className={cn("flex flex-col", mi > 0 && "border-l border-dashed border-border-strong")}
            >
              <Link
                href={mixHref({ id: mix.mixId, scheduledAt: mix.date })}
                className="group flex flex-col rounded-md transition-colors hover:bg-surface-2"
                title={mix.label}
              >
                <ol className="flex">
                  {mix.maps.map((m) => {
                    const state = m.won == null ? "draw" : m.won ? "win" : "loss";
                    return (
                      <li key={m.order} className="flex w-16 flex-col items-center gap-1.5 px-1 pt-1">
                        <MapIcon id={m.mapId} size={30} />
                        <span className="relative flex h-3 w-full items-center justify-center">
                          <span aria-hidden className="absolute inset-x-0 top-1/2 h-px bg-border-strong" />
                          <span
                            className={cn(
                              "relative size-3 rounded-full ring-2 ring-surface",
                              state === "win" && "bg-win",
                              state === "loss" && "bg-loss",
                              state === "draw" && "bg-draw",
                            )}
                          />
                          <span className="sr-only">
                            {mapName(m.mapId)}:{" "}
                            {state === "win" ? "vitória" : state === "loss" ? "derrota" : "sem resultado"}
                          </span>
                        </span>
                        <span className="text-xs font-medium text-fg tabular">
                          {m.own != null && m.opp != null ? `${m.own}:${m.opp}` : "—"}
                        </span>
                      </li>
                    );
                  })}
                </ol>
                <span className="px-2 pt-1 pb-1.5 text-center text-[11px] text-subtle group-hover:text-muted">
                  {mix.label.replace("Mix de ", "")}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </div>
      <p className="flex items-center gap-3 px-4 pb-4 text-xs text-subtle">
        <span className="inline-flex items-center gap-1">
          <span className="size-2 rounded-full bg-win" /> Vitória no mapa
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="size-2 rounded-full bg-loss" /> Derrota no mapa
        </span>
      </p>
    </Card>
  );
}

/**
 * Mapas: um card só, com os jogos de cada mapa (barra dividida em vitórias e
 * derrotas) e o aproveitamento ao lado. Mais jogados primeiro.
 */
export function MapRecords({ records }: { records: MapRecord[] }) {
  if (!records.length) return null;
  const list = [...records].sort((a, b) => b.played - a.played || b.winRate - a.winRate);
  const maxPlayed = Math.max(...records.map((r) => r.played));
  return (
    <Card className="mt-4">
      <CardHeader
        title="Mapas"
        description="Jogos em cada mapa (cada mapa da série conta uma vez) e o aproveitamento."
      />
      <ul className="space-y-3 px-4 pt-3 pb-4">
        {list.map((r) => {
          const lost = r.played - r.won;
          return (
            <li
              key={r.mapId}
              className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-sm"
              title={`${mapName(r.mapId)}: ${r.won}V ${lost}D em ${r.played} ${r.played === 1 ? "jogo" : "jogos"}`}
            >
              <span className="flex min-w-0 items-center gap-2 font-medium">
                <MapIcon id={r.mapId} size={24} />
                <span className="truncate">{mapName(r.mapId)}</span>
              </span>
              <span className="flex h-2.5 gap-0.5" aria-hidden>
                {r.won > 0 && (
                  <span
                    className="rounded-l-sm bg-win last:rounded-r-sm"
                    style={{ width: `${(r.won / maxPlayed) * 100}%` }}
                  />
                )}
                {lost > 0 && (
                  <span
                    className="rounded-r-sm bg-loss first:rounded-l-sm"
                    style={{ width: `${(lost / maxPlayed) * 100}%` }}
                  />
                )}
              </span>
              <span className="w-32 text-right text-xs whitespace-nowrap text-muted tabular">
                <span className="text-fg">{r.played}</span> {r.played === 1 ? "jogo" : "jogos"} ·{" "}
                <b className={r.winRate >= 50 ? "text-win" : "text-loss"}>{r.winRate}%</b>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="flex items-center gap-3 px-4 pb-4 text-xs text-subtle">
        <span className="inline-flex items-center gap-1">
          <span className="size-2 rounded-full bg-win" /> Vitórias
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="size-2 rounded-full bg-loss" /> Derrotas
        </span>
      </p>
    </Card>
  );
}
