import { ChevronRight, Swords } from "lucide-react";
import Link from "next/link";
import { formatDateTime } from "@/lib/format";
import { mapName } from "@/lib/maps";
import { playerResult, playerSide, seriesScore, seriesWinner } from "@/lib/stats";
import { cn } from "@/lib/utils";
import type { ID, Mix } from "@/types/domain";
import { EmptyState } from "../ui/empty-state";
import { ResultBadge, StatusBadge, TeamDot } from "./badges";
import { mixHref } from "@/lib/mix-slug";
import { MapIcon } from "@/components/maps/map-icon";

/** Seu número no mix (K/A/D e a variação de ELO), na lista do Dashboard. */
export interface MixLine {
  k: number;
  a: number;
  d: number;
  eloDelta: number | null;
}

const weekday = new Intl.DateTimeFormat("pt-BR", { weekday: "short", timeZone: "America/Sao_Paulo" });
const DAY = 86_400_000;
/** "seg · há 3 dias" */
function shortWhen(iso: string, now: number) {
  const days = Math.floor((now - new Date(iso).getTime()) / DAY);
  const ago = days <= 0 ? "hoje" : days === 1 ? "ontem" : `há ${days} dias`;
  return `${weekday.format(new Date(iso)).replace(".", "")} · ${ago}`;
}

/**
 * Lista de mixes compacta. Com `perspectiveId`, mostra o resultado do ponto
 * de vista daquele jogador: o time dele primeiro, o placar dele primeiro e o
 * placar de cada mapa do lado dele. Com `lines`, o K/A/D e o ±ELO de cada mix.
 */
export function MixList({
  mixes,
  perspectiveId,
  compact,
  action,
  lines,
  now,
}: {
  mixes: Mix[];
  perspectiveId?: ID;
  compact?: boolean;
  /** Ação extra no fim da linha (ex.: excluir, para admins). */
  action?: (mix: Mix) => React.ReactNode;
  lines?: Map<ID, MixLine>;
  now?: number;
}) {
  if (!mixes.length) {
    return (
      <EmptyState icon={Swords} title="Nenhum mix encontrado" description="Os mixes disputados aparecerão aqui." />
    );
  }
  return (
    <ul className="divide-y divide-border">
      {mixes.map((mix) => {
        const raw = seriesScore(mix);
        const winner = seriesWinner(mix);
        const result = perspectiveId ? playerResult(mix, perspectiveId) : null;
        // Do ponto de vista do jogador: o time dele (e o placar dele) primeiro.
        const mine = perspectiveId ? playerSide(mix, perspectiveId) : null;
        const flip = mine === "B";
        const [a, b] = flip ? [mix.teams[1], mix.teams[0]] : mix.teams;
        const score = raw && flip ? ([raw[1], raw[0]] as const) : raw;
        const first = flip ? "B" : "A";
        const second = flip ? "A" : "B";
        const line = lines?.get(mix.id);
        return (
          <li key={mix.id} className="flex items-center">
            <Link
              href={mixHref(mix)}
              className={cn(
                "group grid min-w-0 flex-1 grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-3 transition-colors hover:bg-surface-2",
                // Lista completa: primeiro o jogo, depois a data.
                compact ? "sm:grid-cols-[9rem_1fr_auto_auto]" : "sm:grid-cols-[1fr_11rem_auto_auto]",
              )}
            >
              <div className={cn("min-w-0", !compact && "sm:col-start-2 sm:row-start-1")}>
                <div className="font-medium text-fg">{mix.name}</div>
                <div className="text-xs text-muted">
                  {compact && now != null ? shortWhen(mix.scheduledAt, now) : formatDateTime(mix.scheduledAt)}
                </div>
              </div>

              <div
                className={cn(
                  "col-span-2 row-start-2 min-w-0 sm:col-span-1 sm:row-start-auto",
                  compact ? "sm:hidden lg:block" : "sm:col-start-1 sm:row-start-1",
                )}
              >
                <div className="flex min-w-0 items-center gap-2 text-sm">
                  <TeamDot side={first} />
                  <span className={cn("truncate", winner === first ? "text-fg" : "text-muted")}>{a.name}</span>
                  {mine && (
                    <span className="shrink-0 rounded bg-brand/15 px-1 text-[10px] font-bold text-brand uppercase">
                      você
                    </span>
                  )}
                  <span className="text-subtle">vs</span>
                  <TeamDot side={second} />
                  <span className={cn("truncate", winner === second ? "text-fg" : "text-muted")}>{b.name}</span>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-subtle">
                  {mix.maps.map((m) => {
                    const own = flip ? [m.scoreB, m.scoreA] : [m.scoreA, m.scoreB];
                    const known = mine && own[0] != null && own[1] != null;
                    return (
                      <span key={m.order} className="inline-flex items-center gap-1">
                        <MapIcon id={m.mapId} size={14} />
                        {mapName(m.mapId)}
                        {known && (
                          <b
                            className={cn(
                              "font-display tabular",
                              own[0]! > own[1]! ? "text-win/80" : own[0]! < own[1]! ? "text-loss/80" : "",
                            )}
                          >
                            {own[0]}–{own[1]}
                          </b>
                        )}
                      </span>
                    );
                  })}
                </div>
              </div>

              <div className="row-span-1 flex items-center justify-end gap-3 sm:row-auto">
                {score ? (
                  <span className="font-display text-lg font-bold tabular">
                    <span className={winner === first ? "text-fg" : "text-muted"}>{score[0]}</span>
                    <span className="mx-1 text-subtle">:</span>
                    <span className={winner === second ? "text-fg" : "text-muted"}>{score[1]}</span>
                  </span>
                ) : (
                  <StatusBadge status={mix.status} />
                )}
                {line ? (
                  <span className="flex flex-col items-end gap-0.5">
                    {result && <ResultBadge result={result} />}
                    <span className="text-[11px] whitespace-nowrap text-muted tabular">
                      {line.k}/{line.a}/{line.d}
                      {line.eloDelta != null && (
                        <b className={cn("ml-1", line.eloDelta >= 0 ? "text-win" : "text-loss")}>
                          {line.eloDelta > 0 ? "+" : line.eloDelta < 0 ? "−" : ""}
                          {Math.abs(line.eloDelta)}
                        </b>
                      )}
                    </span>
                  </span>
                ) : (
                  result && <ResultBadge result={result} />
                )}
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
