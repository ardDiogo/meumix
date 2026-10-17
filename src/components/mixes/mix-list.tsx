import { ChevronRight, Swords } from "lucide-react";
import Link from "next/link";
import { formatDateTime } from "@/lib/format";
import { mapName } from "@/lib/maps";
import { playerResult, seriesScore, seriesWinner } from "@/lib/stats";
import { cn } from "@/lib/utils";
import type { ID, Mix } from "@/types/domain";
import { EmptyState } from "../ui/empty-state";
import { ResultBadge, StatusBadge, TeamDot } from "./badges";
import { mixHref } from "@/lib/mix-slug";

/**
 * Lista de mixes compacta. Com `perspectiveId`, mostra o resultado do ponto
 * de vista daquele jogador.
 */
export function MixList({
  mixes,
  perspectiveId,
  compact,
  action,
}: {
  mixes: Mix[];
  perspectiveId?: ID;
  compact?: boolean;
  /** Ação extra no fim da linha (ex.: excluir, para admins). */
  action?: (mix: Mix) => React.ReactNode;
}) {
  if (!mixes.length) {
    return (
      <EmptyState icon={Swords} title="Nenhum mix encontrado" description="Os mixes disputados aparecerão aqui." />
    );
  }
  return (
    <ul className="divide-y divide-border">
      {mixes.map((mix) => {
        const score = seriesScore(mix);
        const winner = seriesWinner(mix);
        const result = perspectiveId ? playerResult(mix, perspectiveId) : null;
        const [a, b] = mix.teams;
        return (
          <li key={mix.id} className="flex items-center">
            <Link
              href={mixHref(mix)}
              className="group grid min-w-0 flex-1 grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-3 transition-colors hover:bg-surface-2 sm:grid-cols-[9rem_1fr_auto_auto]"
            >
              <div className="min-w-0">
                <div className="font-medium text-fg">{mix.name}</div>
                <div className="text-xs text-muted">{formatDateTime(mix.scheduledAt)}</div>
              </div>

              <div
                className={cn(
                  "col-span-2 row-start-2 min-w-0 sm:col-span-1 sm:row-start-auto",
                  compact && "sm:hidden lg:block",
                )}
              >
                <div className="flex min-w-0 items-center gap-2 text-sm">
                  <TeamDot side="A" />
                  <span className={cn("truncate", winner === "A" ? "text-fg" : "text-muted")}>{a.name}</span>
                  <span className="text-subtle">vs</span>
                  <TeamDot side="B" />
                  <span className={cn("truncate", winner === "B" ? "text-fg" : "text-muted")}>{b.name}</span>
                </div>
                <div className="mt-0.5 truncate text-xs text-subtle">
                  {mix.maps.map((m) => mapName(m.mapId)).join(" · ")}
                </div>
              </div>

              <div className="row-span-1 flex items-center justify-end gap-3 sm:row-auto">
                {score ? (
                  <span className="font-display text-lg font-bold tabular">
                    <span className={winner === "A" ? "text-fg" : "text-muted"}>{score[0]}</span>
                    <span className="mx-1 text-subtle">:</span>
                    <span className={winner === "B" ? "text-fg" : "text-muted"}>{score[1]}</span>
                  </span>
                ) : (
                  <StatusBadge status={mix.status} />
                )}
                {result && <ResultBadge result={result} />}
              </div>

              <ChevronRight
                className="hidden size-4 text-subtle transition-colors group-hover:text-brand sm:block"
                aria-hidden
              />
            </Link>
            {action && <div className="pr-3">{action(mix)}</div>}
          </li>
        );
      })}
    </ul>
  );
}
