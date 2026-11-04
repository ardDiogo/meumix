import { Fragment } from "react";
import type { GcMapStored } from "@/lib/gc-api";
import { roundBreakAfter, roundStory, winnerFirst } from "@/lib/gc-analysis";
import { cn } from "@/lib/utils";

const REASON: Record<string, string> = {
  elimination: "eliminação",
  bomb_defused: "bomba desarmada",
  bomb_exploded: "bomba explodiu",
  target_bombed: "bomba explodiu",
  time_expired: "tempo esgotado",
  timeout: "tempo esgotado",
};

/**
 * Rounds de um mapa, compacto: um quadradinho por round, na cor do time que
 * venceu (o detalhe aparece ao passar o mouse), e a virada, se houve.
 */
export function RoundDots({
  map,
  teams,
  compact = false,
}: {
  map: GcMapStored;
  teams: [string, string];
  /** Quadradinhos menores e a virada numa linha curta embaixo (placar do topo). */
  compact?: boolean;
}) {
  const story = roundStory(map);
  const name = (t: "A" | "B") => teams[t === "A" ? 0 : 1];
  const final = story.scores.at(-1) ?? { a: map.scoreA, b: map.scoreB };
  return (
    <div className={cn("flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1", compact && "mt-1 gap-y-0.5")}>
      <div
        className={cn("flex flex-wrap items-center", compact ? "gap-[2px]" : "gap-[3px]")}
        role="img"
        aria-label="Vencedor de cada round"
      >
        {map.rounds.map((r, i) => {
          const s = story.scores[i]!;
          return (
            <Fragment key={i}>
              <span
                title={`Round ${i + 1}: ${name(r.w)} (${r.ct === r.w ? "CT" : "TR"}) · ${REASON[r.r] ?? r.r} · ${s.a}×${s.b}`}
                className={cn(
                  compact ? "size-2 rounded-[1.5px]" : "size-2.5 rounded-[2px]",
                  r.w === "A" ? "bg-team-a" : "bg-team-b",
                )}
              />
              {roundBreakAfter(i + 1) && i + 1 < map.rounds.length && <span className={compact ? "w-1" : "w-1.5"} />}
            </Fragment>
          );
        })}
      </div>
      {story.comeback && story.winner && (
        <span
          className={cn("text-muted", compact ? "text-[11px]" : "text-xs")}
          title={`${name(story.winner)} perdia de ${winnerFirst(story.comeback.from, story.winner)}`}
        >
          🔥 virada de {winnerFirst(story.comeback.from, story.winner)} para {winnerFirst(final, story.winner)}
        </span>
      )}
    </div>
  );
}
