import { Fragment } from "react";
import { MapIcon } from "@/components/maps/map-icon";
import type { GcMapStored } from "@/lib/gc-api";
import { roundStory } from "@/lib/gc-analysis";
import { mapName } from "@/lib/maps";
import { cn } from "@/lib/utils";
import type { MapId } from "@/types/domain";
import { TeamDot } from "./badges";

const REASON: Record<string, string> = {
  elimination: "eliminação",
  bomb_defused: "bomba desarmada",
  bomb_exploded: "bomba explodiu",
  target_bombed: "bomba explodiu",
  time_expired: "tempo esgotado",
  timeout: "tempo esgotado",
};

/** Divisões do placar: meio tempo no 12 e trocas da prorrogação (MR3) a partir do 24. */
const breakAfter = (round: number) => round === 12 || (round >= 24 && (round - 24) % 3 === 0);

/** Placar do ponto de vista de quem venceu: "2×10", "16×14". */
const winnerFirst = (s: { a: number; b: number }, w: "A" | "B") => (w === "A" ? `${s.a}×${s.b}` : `${s.b}×${s.a}`);

/** Placar round a round de um mapa: cada quadrado é um round, na cor de quem venceu. */
export function RoundStrip({ map, teams }: { map: GcMapStored; teams: [string, string] }) {
  const story = roundStory(map);
  const name = (t: "A" | "B") => teams[t === "A" ? 0 : 1];
  const final = story.scores.at(-1) ?? { a: map.scoreA, b: map.scoreB };
  return (
    <div className="rounded-lg border border-border bg-surface-2/30 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="flex items-center gap-2 font-semibold">
          <MapIcon id={map.mapId as MapId} size={20} />
          {mapName(map.mapId as MapId)}
        </span>
        <span className="tabular">
          <TeamDot side="A" className="mr-1" />
          {name("A")} <span className="font-display font-bold">{final.a}</span> ×{" "}
          <span className="font-display font-bold">{final.b}</span> {name("B")}
          <TeamDot side="B" className="ml-1" />
        </span>
      </div>
      <div
        className="flex flex-wrap items-center gap-1"
        role="img"
        aria-label={`Rounds de ${mapName(map.mapId as MapId)}`}
      >
        {map.rounds.map((r, i) => {
          const s = story.scores[i]!;
          return (
            <Fragment key={i}>
              <span
                title={`Round ${i + 1}: ${name(r.w)} (${r.ct === r.w ? "CT" : "TR"}) · ${REASON[r.r] ?? r.r} · ${s.a}×${s.b}`}
                className={cn(
                  "flex size-5 items-center justify-center rounded-[3px] text-[9px] font-bold text-black/70",
                  r.w === "A" ? "bg-team-a" : "bg-team-b",
                )}
              >
                {r.r === "bomb_defused" ? "D" : r.r === "bomb_exploded" || r.r === "target_bombed" ? "B" : ""}
              </span>
              {breakAfter(i + 1) && i + 1 < map.rounds.length && <span className="mx-1 h-5 w-px bg-border-strong" />}
            </Fragment>
          );
        })}
      </div>
      {(story.comeback || story.streak) && (
        <ul className="mt-2 space-y-0.5 text-xs text-muted">
          {story.comeback && story.winner && (
            <li>
              🔥 <span className="font-semibold text-fg">Virada:</span> o {name(story.winner)} perdia de{" "}
              {winnerFirst(story.comeback.from, story.winner)} e virou para {winnerFirst(final, story.winner)}.
            </li>
          )}
          {story.streak && story.streak.length >= 4 && (
            <li>
              ⚡ <span className="font-semibold text-fg">Maior sequência:</span> {name(story.streak.team)},{" "}
              {story.streak.length} rounds seguidos (rounds {story.streak.from}–
              {story.streak.from + story.streak.length - 1}).
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
