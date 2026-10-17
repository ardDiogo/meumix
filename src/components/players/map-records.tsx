import Link from "next/link";
import { mapName } from "@/lib/maps";
import { mixHref } from "@/lib/mix-slug";
import type { FormPoint, MapRecord } from "@/lib/player-form";
import { cn } from "@/lib/utils";
import { Card, CardHeader } from "../ui/card";
import { MapIcon } from "@/components/maps/map-icon";

const RESULT = {
  win: { label: "Vitória", short: "V", cls: "border-win/50 bg-win/15 text-win" },
  loss: { label: "Derrota", short: "D", cls: "border-loss/50 bg-loss/15 text-loss" },
  draw: { label: "Empate", short: "E", cls: "border-draw/50 bg-draw/15 text-draw" },
} as const;

/** Últimos mixes (mais antigo → mais recente) com resultado e placar. */
export function RecentMatches({ points }: { points: FormPoint[] }) {
  const last = points.slice(-10);
  if (!last.length) return null;
  return (
    <Card className="mt-4">
      <CardHeader title="Partidas" description={`Últimos ${last.length} mixes, do mais antigo ao mais recente`} />
      <ol className="flex gap-1 overflow-x-auto px-4 pt-3 pb-4">
        {last.map((p) => {
          const r = RESULT[p.result];
          return (
            <li key={p.mixId} className="min-w-14 flex-1">
              <Link
                href={mixHref({ id: p.mixId, scheduledAt: p.date })}
                title={`${p.label} · ${r.label}${p.score ? ` ${p.score}` : ""}`}
                className="flex flex-col items-center gap-1 rounded-md py-1.5 transition-colors hover:bg-surface-2"
              >
                <span
                  className={cn("flex size-8 items-center justify-center rounded-full border text-xs font-bold", r.cls)}
                >
                  <span aria-hidden>{r.short}</span>
                  <span className="sr-only">{r.label}</span>
                </span>
                <span className="text-xs font-medium text-fg tabular">{p.score ?? "—"}</span>
                <span className="text-[10px] text-subtle">{p.label.replace("Mix de ", "")}</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </Card>
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
        <CardHeader title="Vitórias por mapa" description="Aproveitamento: verde = vitórias, vermelho = derrotas" />
        <ul className="space-y-3 px-4 pt-3 pb-4">
          {best.map((r) => (
            <li key={r.mapId}>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 font-medium">
                  <MapIcon id={r.mapId} size={22} />
                  {mapName(r.mapId)}
                </span>
                <span className="tabular">
                  <span className="font-semibold text-fg">{r.winRate}%</span>{" "}
                  <span className="text-xs text-subtle">
                    ({r.won}V {r.played - r.won}D)
                  </span>
                </span>
              </div>
              <div
                className="mt-1 flex h-1.5 gap-0.5 overflow-hidden rounded-full"
                role="img"
                aria-label={`${r.won} vitórias e ${r.played - r.won} derrotas em ${mapName(r.mapId)}`}
              >
                {r.won > 0 && <div className="h-full rounded-full bg-win" style={{ flex: r.won }} />}
                {r.played - r.won > 0 && (
                  <div className="h-full rounded-full bg-loss" style={{ flex: r.played - r.won }} />
                )}
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
