"use client";

import { useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { MapIcon } from "@/components/maps/map-icon";
import { mapName } from "@/lib/maps";
import { cn } from "@/lib/utils";
import { Avatar } from "../ui/avatar";
import type { MapId } from "@/types/domain";

/**
 * Categóricas validadas para o fundo escuro (#121419) com o validador do guia de
 * gráficos: contraste ≥ 3:1 e separáveis para daltônicos. O mapa escolhido
 * destaca o próprio top 5 (cores pela posição, com a lista ao lado); o resto
 * entra em "Outros", em cinza.
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

const pct = (wins: number, played: number) => (played ? Math.round((wins / played) * 100) : 0);

/** Maiores vencedores por mapa: escolhe o mapa e vê a rosca e a lista de jogadores. */
export function MapWinners({
  maps,
  names,
  avatars,
}: {
  maps: MapWinnersData[];
  names: Record<string, string>;
  avatars: Record<string, string | null>;
}) {
  const gamesOf = (m: MapWinnersData) => Math.max(...m.players.map((p) => p.played), 0);
  // Mais jogados primeiro; mapas novos entram sozinhos.
  const ordered = [...maps].sort((a, b) => gamesOf(b) - gamesOf(a) || mapName(a.mapId).localeCompare(mapName(b.mapId)));
  const [selected, setSelected] = useState(ordered[0]?.mapId);
  const m = ordered.find((x) => x.mapId === selected) ?? ordered[0];
  if (!m) return null;

  const games = gamesOf(m);
  const name = (id: string) => names[id] ?? "Jogador";
  const winners = m.players.filter((p) => p.wins > 0);
  const slices: Slice[] = winners
    .slice(0, HUES.length)
    .map((p, i) => ({ key: p.playerId, name: name(p.playerId), wins: p.wins, played: p.played, color: HUES[i]! }));
  const rest = winners.slice(HUES.length);
  if (rest.length) {
    slices.push({
      key: "outros",
      name: "Outros",
      wins: rest.reduce((s, p) => s + p.wins, 0),
      played: rest.reduce((s, p) => s + p.played, 0),
      color: OTHER,
    });
  }

  return (
    <div>
      {/* Seletor de mapa. */}
      <div role="tablist" aria-label="Mapa" className="mb-4 flex flex-wrap gap-2">
        {ordered.map((x) => (
          <button
            key={x.mapId}
            type="button"
            role="tab"
            aria-selected={x.mapId === m.mapId}
            onClick={() => setSelected(x.mapId)}
            className={cn(
              "flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm transition-colors",
              x.mapId === m.mapId
                ? "border-brand bg-brand/12 font-semibold text-fg"
                : "border-border text-muted hover:border-border-strong hover:text-fg",
            )}
          >
            <MapIcon id={x.mapId} size={22} />
            {mapName(x.mapId)}
            <span className="text-xs text-subtle tabular">{gamesOf(x)}</span>
          </button>
        ))}
      </div>

      <div className="grid items-center gap-6 md:grid-cols-[minmax(0,20rem)_1fr]">
        <div
          className="relative mx-auto aspect-square w-full max-w-80"
          role="img"
          aria-label={`Vitórias em ${mapName(m.mapId)}: ${slices.map((s) => `${s.name} ${s.wins}`).join(", ")}`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={slices}
                dataKey="wins"
                nameKey="name"
                innerRadius="62%"
                outerRadius="96%"
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
                          ` em ${s.played} ${s.played === 1 ? "jogo" : "jogos"} (${pct(s.wins, s.played)}%)`}
                      </div>
                    </div>
                  );
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          {/* Logo do mapa, grande, no meio da rosca. */}
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1">
            <MapIcon id={m.mapId} size={112} />
            <span className="text-xs text-muted">
              {games} {games === 1 ? "jogo" : "jogos"}
            </span>
          </div>
        </div>

        {/* Todos os jogadores do mapa. */}
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full text-sm tabular">
            <thead>
              <tr className="bg-surface-2 text-[11px] font-semibold tracking-wider text-muted uppercase">
                <th className="w-10 px-3 py-2 text-center">#</th>
                <th className="px-3 py-2 text-left">Jogador</th>
                <th className="px-3 py-2 text-right" title="Vitórias">
                  V
                </th>
                <th className="px-3 py-2 text-right">Jogos</th>
                <th className="px-3 py-2 text-right" title="Aproveitamento">
                  %
                </th>
              </tr>
            </thead>
            <tbody>
              {m.players.map((p, i) => {
                const color = p.wins > 0 ? (HUES[i] ?? OTHER) : null;
                const rate = pct(p.wins, p.played);
                return (
                  <tr key={p.playerId} className="border-t border-border">
                    <td className="px-3 py-1.5 text-center text-xs text-muted">{i + 1}</td>
                    <td className="px-3 py-1.5">
                      <span className="flex items-center gap-2">
                        <span
                          className="size-2.5 shrink-0 rounded-sm"
                          style={{ background: color ?? "transparent" }}
                          aria-hidden
                        />
                        <Avatar name={name(p.playerId)} src={avatars[p.playerId]} size="xs" />
                        <span className="truncate font-medium">{name(p.playerId)}</span>
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-right font-semibold">{p.wins}</td>
                    <td className="px-3 py-1.5 text-right text-muted">{p.played}</td>
                    <td className={cn("px-3 py-1.5 text-right", rate >= 50 ? "text-win" : "text-loss")}>{rate}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
