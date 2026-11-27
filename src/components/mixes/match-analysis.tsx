"use client";

import { Loader2, Sparkles } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { regenerateAnalysis } from "@/app/(app)/mixes/chronicle-actions";
import { joinFacts, type AnalysisTeam } from "@/lib/match-analysis";
import { cn } from "@/lib/utils";
import { Avatar } from "../ui/avatar";
import { Button } from "../ui/button";
import { TeamDot } from "./badges";

/** Admin: pede à IA para escrever (ou reescrever) a análise. */
export function GenerateAnalysis({ matchId, hasAi }: { matchId: string; hasAi: boolean }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant={hasAi ? "ghost" : "outline"}
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await regenerateAnalysis(matchId);
          if (r.ok) toast.success(r.message);
          else toast.error(r.message);
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : <Sparkles />}
      {pending ? "Escrevendo…" : hasAi ? "Gerar de novo" : "Escrever com IA"}
    </Button>
  );
}

/**
 * Análise da partida (dados da GC): um parágrafo por jogador, com os números
 * que importam e uma dica prática. Um time por vez (vencedor primeiro).
 */
export function MatchAnalysis({
  teams,
  teamNames,
  avatars,
  ai,
  viewerId,
}: {
  viewerId?: string | null;
  teams: AnalysisTeam[];
  teamNames: [string, string];
  avatars: Record<string, string | null>;
  /** Escrita pela IA (ao menos um jogador com texto da IA). */
  ai: boolean;
}) {
  // Abre no time de quem está vendo (se jogou); senão, no primeiro (vencedor).
  const mineSide = teams.find((t) => t.players.some((p) => !!viewerId && p.userId === viewerId))?.side;
  const [side, setSide] = useState(mineSide ?? teams[0]?.side ?? "A");
  // Quem está com a análise completa aberta (o padrão mostra só a dica e a resenha).
  const [open, setOpen] = useState<Set<string>>(new Set());
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
        {team.players.map((p) => {
          const me = !!viewerId && p.userId === viewerId;
          const full = open.has(p.key);
          const body = p.text ?? joinFacts(p.facts);
          return (
            <li
              key={p.key}
              className={cn(
                "flex gap-3 rounded-lg border px-4 py-3",
                me ? "border-brand/50 bg-brand/8" : "border-border bg-surface-2/40",
              )}
            >
              <Avatar name={p.name} src={p.userId ? (avatars[p.userId] ?? null) : null} size="sm" className="mt-0.5" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <p className="text-sm leading-relaxed text-muted">
                  <span className="font-semibold text-fg">{p.name}.</span>
                  {me && (
                    <span className="ml-1 rounded bg-brand/15 px-1 text-[10px] font-bold text-brand uppercase">
                      você
                    </span>
                  )}{" "}
                  {full && body}
                  {p.tip && <span className="text-fg"> {p.tip}</span>}
                  {body && (
                    <button
                      type="button"
                      onClick={() =>
                        setOpen((s) => {
                          const n = new Set(s);
                          if (n.has(p.key)) n.delete(p.key);
                          else n.add(p.key);
                          return n;
                        })
                      }
                      className="ml-1.5 text-xs font-medium text-brand hover:underline"
                    >
                      {full ? "ver menos" : "ver análise"}
                    </button>
                  )}
                </p>
                {p.roast && (
                  <p className="border-l-2 border-brand/60 pl-2.5 text-sm leading-relaxed text-brand italic">
                    <span className="mr-1 text-xs font-semibold tracking-wide uppercase not-italic">Resenha</span>
                    {p.roast}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-subtle">
        {ai
          ? "Análise e resenha escritas pela IA com os números da GC; texto com número fora dos dados é descartado."
          : "Gerada pelos números da GC (rating por mapa, aberturas, trades, clutches, utilitárias e mira)."}
      </p>
    </div>
  );
}
