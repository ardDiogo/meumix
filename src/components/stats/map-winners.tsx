"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { MapIcon } from "@/components/maps/map-icon";
import { mapName } from "@/lib/maps";
import type { MapId } from "@/types/domain";

/**
 * Categóricas validadas para o fundo escuro (#121419) com o validador do guia de
 * gráficos: contraste ≥ 3:1 e separáveis para daltônicos. Cada mapa destaca o
 * próprio top 5 (cores pela posição naquele mapa, sempre com a legenda logo
 * abaixo); o resto entra em "Outros", em cinza.
 */
const HUES = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181"];
const OTHER = "#52525b";

export interface MapWinnersData {
  mapId: MapId;
  players: { playerId: string; wins: number; played: number }[];
}

interface Slice {
  key: string;
  name: string;
  wins: number;
  played: number;
  color: string;
}

export function MapWinners({ maps, names }: { maps: MapWinnersData[]; names: Record<string, string> }) {
  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {maps.map((m) => {
          const games = Math.max(...m.players.map((p) => p.played), 0);
          const slices: Slice[] = [];
          let other: Slice | null = null;
          m.players.forEach((p, i) => {
            const color = HUES[i];
            if (color) {
              slices.push({
                key: p.playerId,
                name: names[p.playerId] ?? "Jogador",
                wins: p.wins,
                played: p.played,
                color,
              });
            } else {
              other ??= { key: "outros", name: "Outros", wins: 0, played: 0, color: OTHER };
              other.wins += p.wins;
              other.played += p.played;
            }
          });
          if (other) slices.push(other);
          const top = m.players.slice(0, HUES.length);
          const rest = slices.find((x) => x.key === "outros");
          return (
            <div key={m.mapId} className="rounded-lg border border-border bg-surface-2/30 p-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-display font-semibold">{mapName(m.mapId)}</span>
                <span className="text-xs text-muted">
                  {games} {games === 1 ? "jogo" : "jogos"}
                </span>
              </div>
              <div
                className="relative mx-auto mt-1 h-52 w-full max-w-60"
                role="img"
                aria-label={`Vitórias em ${mapName(m.mapId)}: ${top
                  .map((p) => `${names[p.playerId] ?? "Jogador"} ${p.wins}`)
                  .join(", ")}`}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={slices}
                      dataKey="wins"
                      nameKey="name"
                      innerRadius="62%"
                      outerRadius="95%"
                      paddingAngle={2}
                      cornerRadius={4}
                      stroke="var(--color-surface)"
                      strokeWidth={2}
                      startAngle={90}
                      endAngle={-270}
                      isAnimationActive={false}
                    >
                      {slices.map((s) => (
                        <Cell key={s.key} fill={s.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) => {
                        const s = active ? (payload?.[0]?.payload as Slice | undefined) : undefined;
                        if (!s) return null;
                        return (
                          <div className="rounded-md border border-border bg-surface-2 px-3 py-2 text-xs shadow-lg">
                            <div className="flex items-center gap-1.5 font-medium text-fg">
                              <span className="size-2 rounded-sm" style={{ background: s.color }} aria-hidden />
                              {s.name}
                            </div>
                            <div className="text-muted">
                              {s.wins} {s.wins === 1 ? "vitória" : "vitórias"}
                              {s.key !== "outros" &&
                                ` em ${s.played} ${s.played === 1 ? "jogo" : "jogos"} (${Math.round((s.wins / s.played) * 100)}%)`}
                            </div>
                          </div>
                        );
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                {/* Logo do mapa, grande, no meio da rosca. */}
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <MapIcon id={m.mapId} size={88} />
                </div>
              </div>
              <ol className="mt-2 space-y-1 text-sm">
                {top.map((p, i) => (
                  <li key={p.playerId} className="flex items-center gap-2">
                    <span className="w-4 text-xs text-muted tabular">{i + 1}</span>
                    <span className="size-2.5 shrink-0 rounded-sm" style={{ background: HUES[i] }} aria-hidden />
                    <span className="min-w-0 flex-1 truncate font-medium">{names[p.playerId] ?? "Jogador"}</span>
                    <span className="text-xs text-muted tabular">
                      {p.wins}V · {Math.round((p.wins / p.played) * 100)}%
                    </span>
                  </li>
                ))}
                {rest && (
                  <li className="flex items-center gap-2 text-muted">
                    <span className="w-4" />
                    <span className="size-2.5 shrink-0 rounded-sm" style={{ background: OTHER }} aria-hidden />
                    <span className="flex-1">Outros</span>
                    <span className="text-xs tabular">{rest.wins}V</span>
                  </li>
                )}
              </ol>
            </div>
          );
        })}
      </div>
    </div>
  );
}
