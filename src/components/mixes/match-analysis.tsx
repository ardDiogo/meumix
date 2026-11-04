"use client";

import { useState } from "react";
import { joinFacts, type AnalysisTeam } from "@/lib/match-analysis";
import { cn } from "@/lib/utils";
import { Avatar } from "../ui/avatar";
import { TeamDot } from "./badges";

/**
 * Análise da partida (dados da GC): um parágrafo por jogador, com os números
 * que importam e uma dica prática. Um time por vez (vencedor primeiro).
 */
export function MatchAnalysis({
  teams,
  teamNames,
  avatars,
}: {
  teams: AnalysisTeam[];
  teamNames: [string, string];
  avatars: Record<string, string | null>;
}) {
  const [side, setSide] = useState(teams[0]?.side ?? "A");
  const team = teams.find((t) => t.side === side) ?? teams[0];
  if (!team) return null;
  const nameOf = (s: "A" | "B") => teamNames[s === "A" ? 0 : 1];

  return (
    <div className="space-y-3">
      <div role="tablist" aria-label="Time" className="flex flex-wrap gap-2">
        {teams.map((t) => (
          <button
            key={t.side}
            type="button"
            role="tab"
            aria-selected={t.side === side}
            onClick={() => setSide(t.side)}
            className={cn(
              "flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors",
              t.side === side
                ? "border-brand bg-brand/12 font-semibold text-fg"
                : "border-border text-muted hover:border-border-strong hover:text-fg",
            )}
          >
            <TeamDot side={t.side} />
            {nameOf(t.side)}
            {t.won != null && (
              <span className={cn("text-xs font-semibold", t.won ? "text-win" : "text-loss")}>
                {t.won ? "vencedor" : "derrota"}
              </span>
            )}
          </button>
        ))}
      </div>
      <ul className="space-y-2.5">
        {team.players.map((p) => (
          <li key={p.key} className="flex gap-3 rounded-lg border border-border bg-surface-2/40 px-4 py-3">
            <Avatar name={p.name} src={p.userId ? (avatars[p.userId] ?? null) : null} size="sm" className="mt-0.5" />
            <p className="text-sm leading-relaxed text-muted">
              <span className="font-semibold text-fg">{p.name}.</span> {joinFacts(p.facts)}
              {p.tip && <span className="text-fg"> {p.tip}</span>}
            </p>
          </li>
        ))}
      </ul>
      <p className="text-xs text-subtle">
        Gerada pelos números da GC (rating por mapa, aberturas, trades, clutches, utilitárias e mira).
      </p>
    </div>
  );
}
