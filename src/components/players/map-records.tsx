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

/** Rosca (pizza) de vitórias e derrotas com o emblema do mapa no centro. */
function MapDonut({ record }: { record: MapRecord }) {
  const size = 104;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const lost = record.played - record.won;
  // 2px de folga entre as fatias quando há as duas.
  const gap = record.won && lost ? 2 : 0;
  const winLen = Math.max((record.won / record.played) * c - gap, 0);
  const lossLen = Math.max((lost / record.played) * c - gap, 0);
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className="relative"
        style={{ width: size, height: size }}
        role="img"
        aria-label={`${mapName(record.mapId)}: ${record.won} vitórias e ${lost} derrotas`}
      >
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-surface-2)" strokeWidth={stroke} />
          {record.won > 0 && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke="var(--color-win)"
              strokeWidth={stroke}
              strokeDasharray={`${winLen} ${c}`}
              strokeDashoffset={-gap / 2}
            />
          )}
          {lost > 0 && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke="var(--color-loss)"
              strokeWidth={stroke}
              strokeDasharray={`${lossLen} ${c}`}
              strokeDashoffset={-(winLen + gap * 1.5)}
            />
          )}
        </svg>
        <span className="absolute inset-0 flex items-center justify-center">
          <MapIcon id={record.mapId} size={58} />
        </span>
      </div>
      <div className="text-center">
        <div className="text-sm font-medium">{mapName(record.mapId)}</div>
        <div className="text-xs tabular">
          <span className="font-semibold text-fg">{record.winRate}%</span>{" "}
          <span className="text-subtle">
            {record.won}V {lost}D
          </span>
        </div>
      </div>
    </div>
  );
}

/** Mapas mais jogados e melhor aproveitamento por mapa. */
export function MapRecords({ records }: { records: MapRecord[] }) {
  if (!records.length) return null;
  const mostPlayed = [...records].sort((a, b) => b.played - a.played || b.winRate - a.winRate).slice(0, 5);
  const best = [...records].sort((a, b) => b.winRate - a.winRate || b.played - a.played).slice(0, 5);
  const maxPlayed = Math.max(...records.map((r) => r.played));
  return (
    <div className="mt-4 grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader title="Mapas mais jogados" description="Cada mapa da série conta uma vez" />
        <ul className="space-y-3 px-4 pt-3 pb-4">
          {mostPlayed.map((r) => (
            <li key={r.mapId}>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 font-medium">
                  <MapIcon id={r.mapId} size={22} />
                  {mapName(r.mapId)}
                </span>
                <span className="text-muted tabular">{r.played}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-surface-2">
                <div className="h-full rounded-full bg-brand" style={{ width: `${(r.played / maxPlayed) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <CardHeader title="Vitórias por mapa" description="Verde = vitórias, vermelho = derrotas" />
        <ul className="grid grid-cols-2 gap-4 px-4 pt-4 pb-4 sm:grid-cols-3">
          {best.map((r) => (
            <li key={r.mapId}>
              <MapDonut record={r} />
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
