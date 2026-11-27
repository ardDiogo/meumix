import { Crown, Target } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { bolaoForMatch } from "@/services/bolao";
import { Avatar } from "../ui/avatar";
import { Card } from "../ui/card";
import { PredictionLine } from "./bolao-panel";

/** Bolão conferido na página do mix finalizado (some se ninguém palpitou). */
export async function BolaoResult({ matchId }: { matchId: string }) {
  const result = await bolaoForMatch(matchId).catch(() => null);
  if (!result?.entries.length) return null;
  const top = result.entries[0]!.score?.points ?? 0;
  return (
    <Card>
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="flex items-center gap-2 font-display text-sm font-semibold tracking-wide uppercase">
          <Target className="size-4 text-brand" aria-hidden /> Bolão
        </h2>
        <Link href="/bolao" className="text-xs font-medium text-muted hover:text-brand">
          Ranking do bolão →
        </Link>
      </div>
      {/* O resultado oficial uma vez, para comparar com os palpites. */}
      <p className="border-b border-border bg-surface-2/40 px-4 py-2 text-xs text-muted">
        Resultado:{" "}
        <span className="font-semibold text-fg">
          {result.outcome.winnerCaptain ? `Time ${result.names[result.outcome.winnerCaptain] ?? "?"}` : "Empate"}{" "}
          {result.outcome.mapsWon}×{result.outcome.mapsLost}
        </span>
        {result.outcome.kind && result.outcome.kind !== "draw"
          ? ` (${result.outcome.kind === "sweep" ? "vitória seca" : "com deslize"})`
          : ""}
        {" · "}MVP{" "}
        <span className="text-fg">{result.outcome.mvpId ? (result.names[result.outcome.mvpId] ?? "?") : "—"}</span>
        {" · "}Lanterna{" "}
        <span className="text-fg">
          {result.outcome.lanternaId ? (result.names[result.outcome.lanternaId] ?? "?") : "—"}
        </span>
      </p>
      <ul className="divide-y divide-border">
        {result.entries.map((e) => (
          <li key={e.userId} className="flex items-center gap-3 px-4 py-2">
            <Avatar name={e.name} src={e.avatarUrl} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">
                {e.name}
                {top > 0 && e.score?.points === top && (
                  <Crown className="ml-1.5 inline size-3.5 text-brand" aria-label="Maior pontuação" />
                )}
              </div>
              <PredictionLine p={e.prediction} score={e.score} names={result.names} />
            </div>
            <span
              className={cn(
                "shrink-0 font-display text-lg font-bold tabular",
                e.score?.points ? "text-brand" : "text-subtle",
              )}
            >
              {e.score?.points ?? 0}
              <span className="text-xs font-medium text-muted"> pts</span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
