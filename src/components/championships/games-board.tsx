import { Trophy } from "lucide-react";
import Link from "next/link";
import type { PlayoffFormat } from "@/lib/championship";
import { playoffRounds, roundTitle } from "@/lib/championship-playoffs";
import { cn } from "@/lib/utils";
import type { MatchRow } from "@/services/championships";
import type { BoardTeam } from "./draft-board";
import { TeamLogo } from "./team-logo";

const TZ = "America/Sao_Paulo";
const day = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: TZ });
const hour = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
const FIRM = new Set(["approval", "scheduled", "live", "finished"]);

/** Altura de um card (2 linhas de time): usada para alinhar a chave. */
const CARD = "h-[58px]";

function GameCard({
  n,
  match: m,
  teamById,
  score,
  href,
  tag,
  wide = false,
}: {
  /** Ocupa a largura da coluna (fase classificatória) em vez da largura fixa da chave. */
  wide?: boolean;
  n: number;
  match: MatchRow;
  teamById: Map<string, BoardTeam>;
  score: { home: number; away: number } | null;
  href: string;
  /** Texto curto no lugar de um time ainda indefinido ("Vencedor do 11"). */
  tag?: { home?: string; away?: string };
}) {
  const row = (id: string | null, placeholder?: string) => {
    const t = id ? teamById.get(id) : null;
    const lost = !!m.winnerTeam && !!id && m.winnerTeam !== id;
    const won = !!m.winnerTeam && m.winnerTeam === id;
    return (
      <div className="flex h-[29px] min-w-0 items-center gap-1.5 px-2">
        {t ? (
          <TeamLogo team={t} size={18} />
        ) : (
          <span className="size-[18px] shrink-0 rounded border border-dashed border-border" />
        )}
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-[13px] leading-none",
            t ? "font-semibold" : "text-[11px] text-subtle italic",
            lost && "text-muted",
            won && "text-fg",
          )}
        >
          {t?.name ?? placeholder ?? "A definir"}
        </span>
      </div>
    );
  };
  const when = m.scheduledAt && FIRM.has(m.status) ? m.scheduledAt : null;
  return (
    <div className={cn("flex items-center gap-1.5", wide && "w-full")}>
      <span className="w-5 shrink-0 text-right text-[11px] text-subtle tabular">{n}</span>
      <Link
        href={href}
        className={cn(
          "group flex overflow-hidden rounded-md border bg-surface-2/70 transition-colors hover:border-brand/60",
          CARD,
          wide ? "min-w-0 flex-1" : "w-56",
          m.status === "live"
            ? "border-win/60"
            : m.status === "cancelled"
              ? "border-loss/40 opacity-60"
              : "border-border",
        )}
      >
        <div className="flex min-w-0 flex-1 flex-col divide-y divide-border">
          {row(m.homeTeam, tag?.home)}
          {row(m.awayTeam, tag?.away)}
        </div>
        <div
          className={cn(
            "flex w-[58px] shrink-0 flex-col items-center justify-center border-l border-border text-center leading-tight",
            score ? "bg-bg/60" : "bg-bg/40",
          )}
        >
          {score ? (
            <>
              <span className="font-display text-[15px] font-bold tabular">
                <span className={score.home > score.away ? "text-win" : "text-muted"}>{score.home}</span>
                <span className="mx-0.5 text-subtle">:</span>
                <span className={score.away > score.home ? "text-win" : "text-muted"}>{score.away}</span>
              </span>
              <span className="text-[10px] text-subtle">{when ? day(when) : m.status === "live" ? "ao vivo" : ""}</span>
            </>
          ) : when ? (
            <>
              <span className="font-display text-[13px] font-bold">{day(when)}</span>
              <span className="text-[10px] text-muted">{hour(when)}</span>
            </>
          ) : (
            <span className="px-1 text-[10px] text-subtle">
              {m.status === "postponed" ? "adiado" : m.status === "cancelled" ? "cancelado" : "a definir"}
            </span>
          )}
        </div>
      </Link>
    </div>
  );
}

/**
 * Tabela de jogos em colunas (como uma chave de campeonato): uma coluna por
 * rodada da fase classificatória e, depois, as fases dos playoffs ligadas
 * por linhas até o campeão. Cada jogo tem número, os dois times e a data.
 */
export function GamesBoard({
  slug,
  teams,
  matches,
  scores,
  format,
  showGroup = true,
}: {
  slug: string;
  teams: BoardTeam[];
  matches: MatchRow[];
  scores: Record<string, { home: number; away: number }>;
  format: PlayoffFormat;
  showGroup?: boolean;
}) {
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const group = matches.filter((m) => m.stage === "group");
  const playoffs = matches.filter((m) => m.stage === "playoff");
  const groupRounds = [...new Set(group.map((m) => m.round))].sort((a, b) => a - b);
  const totalPo = playoffRounds(format);
  // Numeração: rodadas em ordem, depois os playoffs fase a fase.
  const ordered = [
    ...groupRounds.flatMap((r) => group.filter((m) => m.round === r)),
    ...Array.from({ length: totalPo }, (_, i) =>
      playoffs.filter((m) => m.round === i + 1).sort((a, b) => a.leg - b.leg),
    ).flat(),
  ];
  const number = new Map(ordered.map((m, i) => [m.id, i + 1]));
  const href = (m: MatchRow) => `/campeonatos/${slug}/jogos/${m.id}`;
  const final = playoffs.find((m) => m.round === totalPo);
  const champion = final?.winnerTeam ? teamById.get(final.winnerTeam) : null;

  // Nos playoffs, quem ainda não está definido mostra de onde vem ("Venc. 11").
  const tagOf = (m: MatchRow) => {
    if (m.round === 1) return undefined;
    const prev = playoffs.filter((p) => p.round === m.round - 1);
    const from = (leg: number) => prev.find((p) => p.leg === leg);
    const a = from(m.leg * 2 - 1);
    const b = from(m.leg * 2);
    return {
      home: a ? `Vencedor do ${number.get(a.id)}` : undefined,
      away: b ? `Vencedor do ${number.get(b.id)}` : undefined,
    };
  };

  const header = (title: string, sub?: string) => (
    <div className="mb-3 h-9 border-b border-border pb-2">
      <div className="font-display text-xs font-semibold tracking-wider text-brand uppercase">{title}</div>
      {sub && <div className="truncate text-[11px] text-subtle">{sub}</div>}
    </div>
  );

  return (
    <div className="space-y-6">
      {showGroup && groupRounds.length > 0 && (
        <div>
          <h3 className="mb-3 font-display text-sm font-semibold tracking-wide text-muted uppercase">
            Fase classificatória
          </h3>
          <div className="grid gap-x-5 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {groupRounds.map((r) => {
              const games = group.filter((m) => m.round === r);
              const playing = new Set(games.flatMap((m) => [m.homeTeam, m.awayTeam]));
              const off = teams.filter((t) => !playing.has(t.id));
              return (
                <section key={`g${r}`} className="flex flex-col">
                  {header(`Rodada ${r}`, `MD${games[0]?.bestOf ?? 1}`)}
                  <div className="flex flex-col gap-2.5">
                    {games.map((m) => (
                      <GameCard
                        key={m.id}
                        n={number.get(m.id)!}
                        match={m}
                        teamById={teamById}
                        score={scores[m.id] ?? null}
                        href={href(m)}
                        wide
                      />
                    ))}
                  </div>
                  {off.length > 0 && (
                    <div className="mt-2.5 ml-6.5 text-[11px] text-subtle">
                      Folga: {off.map((t) => t.name).join(", ")}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </div>
      )}

      {totalPo > 0 && (
        <div className={cn(showGroup && groupRounds.length > 0 && "border-t border-border pt-5")}>
          {showGroup && (
            <h3 className="mb-3 font-display text-sm font-semibold tracking-wide text-muted uppercase">Playoffs</h3>
          )}
          <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
            <div className="flex min-w-max items-stretch gap-5">
              {totalPo > 0 &&
                Array.from({ length: totalPo }, (_, i) => i + 1).map((round) => {
                  const games = playoffs.filter((m) => m.round === round).sort((a, b) => a.leg - b.leg);
                  const last = round === totalPo;
                  // Pares de jogos que alimentam o jogo seguinte: a linha da chave fecha cada par.
                  const pairs = last
                    ? games.map((g) => [g])
                    : Array.from({ length: Math.ceil(games.length / 2) }, (_, k) => games.slice(k * 2, k * 2 + 2));
                  return (
                    <section key={`p${round}`} className="flex flex-col">
                      {header(
                        roundTitle(format, round) || "Playoffs",
                        games.length ? `MD${games[0]!.bestOf}` : "a gerar",
                      )}
                      <div className="flex flex-1 flex-col justify-around gap-6">
                        {games.length === 0 ? (
                          <div
                            className={cn(
                              "ml-6.5 flex w-56 items-center justify-center rounded-md border border-dashed border-border text-[11px] text-subtle",
                              CARD,
                            )}
                          >
                            Sai da classificação
                          </div>
                        ) : (
                          pairs.map((pair, k) => (
                            <div key={k} className="relative flex flex-col justify-around gap-6">
                              {pair.map((m) => (
                                <div key={m.id} className="relative">
                                  <GameCard
                                    n={number.get(m.id)!}
                                    match={m}
                                    teamById={teamById}
                                    score={scores[m.id] ?? null}
                                    href={href(m)}
                                    tag={tagOf(m)}
                                  />
                                  {/* Saída de cada jogo para a direita. */}
                                  <span
                                    aria-hidden
                                    className="absolute top-1/2 -right-2.5 h-px w-2.5 bg-border-strong"
                                  />
                                </div>
                              ))}
                              {pair.length === 2 && (
                                <>
                                  {/* Linha vertical do par e a ligação até o jogo seguinte. */}
                                  <span
                                    aria-hidden
                                    className="absolute top-[29px] -right-2.5 bottom-[29px] w-px bg-border-strong"
                                  />
                                  <span aria-hidden className="absolute top-1/2 -right-5 h-px w-2.5 bg-border-strong" />
                                </>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </section>
                  );
                })}

              {totalPo > 0 && (
                <section className="flex flex-col">
                  {header("Campeão")}
                  <div className="flex flex-1 flex-col justify-around">
                    <div
                      className={cn(
                        "flex w-48 items-center gap-2 rounded-md border px-3",
                        CARD,
                        champion
                          ? "border-brand/70 bg-brand/10 shadow-[0_0_24px_-8px] shadow-brand/60"
                          : "border-dashed border-border",
                      )}
                    >
                      <Trophy className={cn("size-5 shrink-0", champion ? "text-brand" : "text-subtle")} aria-hidden />
                      {champion ? (
                        <>
                          <TeamLogo team={champion} size={22} />
                          <span className="truncate font-display font-bold">{champion.name}</span>
                        </>
                      ) : (
                        <span className="text-[11px] text-subtle italic">
                          {final ? `Vencedor do ${number.get(final.id)}` : "A definir"}
                        </span>
                      )}
                    </div>
                  </div>
                </section>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
