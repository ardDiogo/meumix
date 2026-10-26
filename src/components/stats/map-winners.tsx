"use client";

import { useState } from "react";
import { MapIcon } from "@/components/maps/map-icon";
import { mapName } from "@/lib/maps";
import { cn } from "@/lib/utils";
import type { MapId } from "@/types/domain";
import { Avatar } from "../ui/avatar";

export interface MapWinnersData {
  mapId: MapId;
  players: { playerId: string; wins: number; played: number }[];
}

const pct = (wins: number, played: number) => (played ? Math.round((wins / played) * 100) : 0);

/**
 * Maiores vencedores por mapa: escolhe o mapa e vê uma barra por jogador,
 * dividida em vitórias (verde) e derrotas (vermelho); o tamanho total é o
 * número de jogos naquele mapa. Ordem: mais vitórias, depois melhor
 * aproveitamento.
 */
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

  const name = (id: string) => names[id] ?? "Jogador";
  const games = gamesOf(m);
  const players = [...m.players].sort(
    (a, b) =>
      b.wins - a.wins ||
      pct(b.wins, b.played) - pct(a.wins, a.played) ||
      b.played - a.played ||
      name(a.playerId).localeCompare(name(b.playerId)),
  );
  const scale = Math.max(...players.map((p) => p.played), 1);

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

      {/* Mapa escolhido: logo grande e legenda. */}
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <MapIcon id={m.mapId} size={72} />
        <div className="min-w-0 flex-1">
          <div className="font-display text-xl font-bold">{mapName(m.mapId)}</div>
          <div className="text-sm text-muted">
            {games} {games === 1 ? "jogo" : "jogos"} · {players.length} jogadores
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-win" aria-hidden /> Vitórias
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-loss" aria-hidden /> Derrotas
          </span>
        </div>
      </div>

      <ol className="space-y-1.5">
        {players.map((p, i) => {
          const losses = p.played - p.wins;
          const rate = pct(p.wins, p.played);
          return (
            <li
              key={p.playerId}
              className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 rounded-md px-1 py-1 hover:bg-surface-2/60 sm:grid-cols-[1.5rem_minmax(0,12rem)_1fr_8rem] sm:gap-x-3"
              title={`${name(p.playerId)}: ${p.wins} ${p.wins === 1 ? "vitória" : "vitórias"} e ${losses} ${losses === 1 ? "derrota" : "derrotas"} em ${p.played} ${p.played === 1 ? "jogo" : "jogos"} (${rate}%)`}
            >
              <span className="text-center text-xs text-muted tabular">{i + 1}</span>
              <span className="flex min-w-0 items-center gap-2">
                <Avatar name={name(p.playerId)} src={avatars[p.playerId]} size="xs" />
                <span className="truncate text-sm font-medium">{name(p.playerId)}</span>
              </span>
              {/* Barra: vitórias + derrotas, na escala do jogador com mais jogos neste mapa. */}
              {/* No celular, a barra vai para a linha de baixo, com a largura toda. */}
              <span
                className="order-last col-span-2 col-start-2 flex h-3.5 gap-0.5 sm:order-none sm:col-span-1 sm:col-start-auto"
                aria-hidden
              >
                {p.wins > 0 && (
                  <span
                    className="rounded-l-sm bg-win last:rounded-r-sm"
                    style={{ width: `${(p.wins / scale) * 100}%` }}
                  />
                )}
                {losses > 0 && (
                  <span
                    className="rounded-r-sm bg-loss first:rounded-l-sm"
                    style={{ width: `${(losses / scale) * 100}%` }}
                  />
                )}
              </span>
              <span className="text-right text-xs whitespace-nowrap text-muted tabular">
                <span className="font-semibold text-fg">{p.wins}V</span> · {losses}D ·{" "}
                <span className={rate >= 50 ? "text-win" : "text-loss"}>{rate}%</span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
