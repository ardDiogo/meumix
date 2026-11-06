"use client";

import { Check, Crown, Hand, History, Loader2, Play, RotateCcw, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";
import { toast } from "sonner";
import {
  pickPlayer,
  playAdedonha,
  resetDraft,
  setPot,
  startDraft,
  undoLastPick,
} from "@/app/(app)/campeonatos/draft-actions";
import { snakeOrder } from "@/lib/championship-draft";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";
import { Avatar } from "../ui/avatar";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader } from "../ui/card";
import { Select } from "../ui/input";
import { TeamLogo } from "./team-logo";

export type BoardTeam = {
  id: string;
  name: string;
  tag: string;
  color: string;
  hasLogo: boolean;
  captainId: string | null;
  draftOrder: number | null;
};
export type BoardPlayer = {
  userId: string;
  nickname: string;
  avatarUrl: string | null;
  pot: number | null;
  teamId: string | null;
};
export type BoardRound = {
  round: number;
  startTeam: string;
  remaining: string[];
  played: string[];
  revealed: Record<string, number> | null;
  total: number | null;
  pickedTeam: string | null;
  resolvedAt: string | null;
};
export type BoardPick = {
  id: string;
  pickNo: number;
  pot: number;
  teamId: string;
  userId: string;
  undoneAt: string | null;
};

type Result = { ok: boolean; message: string };

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<Result>, confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return;
    start(async () => {
      const r = await fn();
      if (r.ok) toast.success(r.message);
      else toast.error(r.message);
      router.refresh();
    });
  };
  return [pending, run] as const;
}

/** Atualiza a tela sozinha quando alguém joga ou escolhe (tempo real, com reserva a cada 8 s). */
function LiveDraft({ championshipId, active }: { championshipId: string; active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 300);
    };
    const poll = setInterval(() => router.refresh(), 8000);
    const supabase = getSupabaseBrowserClient();
    const channel = supabase?.channel(`campeonato-${championshipId}`);
    if (supabase && channel) {
      for (const table of ["championship_drafts", "championship_adedonha_rounds", "championship_picks"])
        channel.on(
          "postgres_changes",
          { event: "*", schema: "public", table, filter: `championship_id=eq.${championshipId}` },
          refresh,
        );
      channel.subscribe();
    }
    return () => {
      clearTimeout(timer);
      clearInterval(poll);
      if (supabase && channel) void supabase.removeChannel(channel);
    };
  }, [active, championshipId, router]);
  return null;
}

function TeamChip({ team, className }: { team: BoardTeam; className?: string }) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2", className)}>
      <TeamLogo team={team} size={24} />
      <span className="truncate font-semibold">{team.name}</span>
    </span>
  );
}

export function DraftBoard({
  championshipId,
  status,
  teams,
  players,
  rounds,
  picks,
  potCount,
  viewerId,
  isManager,
  issues,
}: {
  championshipId: string;
  status: "order" | "picking" | "done" | null;
  teams: BoardTeam[];
  players: BoardPlayer[];
  rounds: BoardRound[];
  picks: BoardPick[];
  potCount: number;
  viewerId: string | null;
  isManager: boolean;
  /** O que falta para começar (inscritos, capitães, potes). */
  issues: string[];
}) {
  const [pending, run] = useRun();
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const playerById = new Map(players.map((p) => [p.userId, p]));
  const captains = new Set(teams.map((t) => t.captainId).filter(Boolean));
  const pool = players.filter((p) => !captains.has(p.userId));
  const order = [...teams].filter((t) => t.draftOrder != null).sort((a, b) => a.draftOrder! - b.draftOrder!);
  const active = picks.filter((p) => !p.undoneAt).sort((a, b) => a.pickNo - b.pickNo);
  const total = teams.length * potCount;
  const nextNo = active.length + 1;
  const snake =
    order.length === teams.length
      ? snakeOrder(
          order.map((t) => t.id),
          potCount,
        )
      : [];
  const next =
    status === "picking" && nextNo <= total && snake.length
      ? {
          pot: Math.floor((nextNo - 1) / teams.length) + 1,
          team: teamById.get(snake[Math.floor((nextNo - 1) / teams.length)]![(nextNo - 1) % teams.length]!)!,
        }
      : null;
  const canPick = !!next && (isManager || next.team.captainId === viewerId);
  const openRound = rounds.find((r) => !r.resolvedAt);

  return (
    <div className="space-y-4">
      <LiveDraft championshipId={championshipId} active={status === "order" || status === "picking"} />

      {/* Andamento */}
      <Card className={cn(next && "border-brand/50")}>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-semibold tracking-wider text-muted uppercase">
                {status == null
                  ? "Montando os potes"
                  : status === "order"
                    ? `Adedonha · rodada ${openRound?.round ?? rounds.length}`
                    : status === "picking"
                      ? `Escolha ${nextNo} de ${total} · Pote ${next?.pot}`
                      : "Draft concluído"}
              </div>
              <div className="mt-0.5 font-display text-lg font-bold">
                {status == null && "Os capitães jogam a adedonha para definir a ordem."}
                {status === "order" && "Os capitães jogam de 0 a 5 ao mesmo tempo."}
                {next && (
                  <span className="flex items-center gap-2">
                    Vez do <TeamChip team={next.team} />
                  </span>
                )}
                {status === "done" && "Elencos formados."}
              </div>
            </div>
            {isManager && (
              <div className="flex flex-wrap gap-2">
                {status == null && (
                  <Button
                    variant="primary"
                    disabled={pending || issues.length > 0}
                    onClick={() =>
                      run(
                        () => startDraft(championshipId),
                        "Começar o draft? Inscritos, capitães e potes ficam fechados (dá para reiniciar depois).",
                      )
                    }
                  >
                    {pending ? <Loader2 className="animate-spin" /> : <Play />} Começar draft
                  </Button>
                )}
                {(status === "picking" || status === "done") && active.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() => run(() => undoLastPick(championshipId), "Desfazer a última escolha?")}
                  >
                    <Undo2 /> Desfazer última
                  </Button>
                )}
                {status != null && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      run(
                        () => resetDraft(championshipId),
                        "Reiniciar o draft? A ordem e todas as escolhas voltam do zero (ficam no histórico).",
                      )
                    }
                  >
                    <RotateCcw /> Reiniciar
                  </Button>
                )}
              </div>
            )}
          </div>
          {(status === "picking" || status === "done") && (
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
              <div
                className="h-full rounded-full bg-brand transition-all"
                style={{ width: `${(active.length / total) * 100}%` }}
              />
            </div>
          )}
          {status == null && isManager && issues.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-4 text-sm text-muted">
              {issues.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Adedonha */}
      {status === "order" && openRound && (
        <Card>
          <CardHeader
            title={`Adedonha · rodada ${openRound.round}`}
            description={`Todos jogam de 0 a 5 sem ver o do outro. A contagem começa no ${teamById.get(openRound.startTeam)?.name} e segue a roda; quem o total atingir é o ${openRound.round}º a escolher.`}
          />
          <ul className="divide-y divide-border">
            {openRound.remaining.map((id) => {
              const t = teamById.get(id)!;
              const done = openRound.played.includes(id);
              const mine = t.captainId === viewerId;
              const can = !done && (mine || isManager);
              return (
                <li key={id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <TeamChip team={t} className="min-w-36 flex-1" />
                  {id === openRound.startTeam && (
                    <span className="text-xs font-semibold text-brand">começa a contagem</span>
                  )}
                  {done ? (
                    <span className="flex items-center gap-1 text-sm font-semibold text-win">
                      <Check className="size-4" aria-hidden /> Jogou
                    </span>
                  ) : can ? (
                    <div
                      className="flex flex-wrap items-center gap-1.5"
                      role="group"
                      aria-label={`Jogada do ${t.name}`}
                    >
                      {!mine && <span className="text-xs text-subtle">pelo capitão:</span>}
                      {[0, 1, 2, 3, 4, 5].map((n) => (
                        <Button
                          key={n}
                          variant="outline"
                          size="sm"
                          className="w-9 px-0 font-display text-base"
                          disabled={pending}
                          onClick={() => run(() => playAdedonha(championshipId, id, n))}
                          aria-label={`Jogar ${n}`}
                        >
                          {n}
                        </Button>
                      ))}
                    </div>
                  ) : (
                    <span className="flex items-center gap-1 text-sm text-muted">
                      <Hand className="size-4" aria-hidden /> Aguardando o capitão
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {/* Ordem e rodadas da adedonha */}
      {status != null && (
        <Card>
          <CardHeader title="Ordem de escolha" description="Pote ímpar segue a ordem; pote par volta (serpentina)." />
          <CardContent className="space-y-4">
            <ol className="flex flex-wrap gap-2">
              {teams.map((_, i) => {
                const t = order[i];
                return (
                  <li
                    key={i}
                    className={cn(
                      "flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm",
                      t ? "border-border bg-surface-2" : "border-dashed border-border text-subtle",
                    )}
                  >
                    <span className="font-display font-bold text-brand">{i + 1}º</span>
                    {t ? <TeamChip team={t} /> : "a definir"}
                  </li>
                );
              })}
            </ol>
            {rounds.some((r) => r.resolvedAt) && (
              <ul className="space-y-1.5 text-xs text-muted">
                {rounds
                  .filter((r) => r.resolvedAt)
                  .map((r) => (
                    <li key={r.round}>
                      <span className="font-semibold text-fg">Rodada {r.round}:</span>{" "}
                      {r.remaining
                        .map((id) => `${teamById.get(id)?.tag || teamById.get(id)?.name} ${r.revealed?.[id] ?? "?"}`)
                        .join(" · ")}{" "}
                      = <span className="font-semibold text-fg">{r.total}</span>, contando do{" "}
                      {teamById.get(r.startTeam)?.name} →{" "}
                      <span className="font-semibold text-brand">{teamById.get(r.pickedTeam ?? "")?.name}</span>
                    </li>
                  ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {/* Potes */}
      <section>
        <h2 className="mb-3 font-display text-sm font-semibold tracking-wide text-muted uppercase">Potes</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: potCount }, (_, i) => i + 1).map((pot) => {
            const list = pool
              .filter((p) => p.pot === pot)
              .sort((a, b) => a.nickname.localeCompare(b.nickname, "pt-BR"));
            const current = next?.pot === pot;
            return (
              <Card key={pot} className={cn(current && "border-brand/60 shadow-[0_0_24px_-10px] shadow-brand/60")}>
                <CardHeader
                  title={`Pote ${pot}`}
                  description={current ? "Pote da vez" : `${list.filter((p) => !p.teamId).length} disponíveis`}
                />
                <ul className="divide-y divide-border">
                  {list.map((p) => {
                    const team = p.teamId ? teamById.get(p.teamId) : null;
                    return (
                      <li
                        key={p.userId}
                        className={cn("flex items-center gap-2 px-4 py-2 text-sm", team && "opacity-55")}
                      >
                        <Avatar name={p.nickname} src={p.avatarUrl} size="xs" />
                        <span className={cn("min-w-0 flex-1 truncate", team && "line-through decoration-subtle")}>
                          {p.nickname}
                        </span>
                        {team && (
                          <span className="text-xs font-semibold" style={{ color: team.color }}>
                            {team.tag || team.name}
                          </span>
                        )}
                        {current && !team && canPick && (
                          <Button
                            variant="primary"
                            size="sm"
                            disabled={pending}
                            onClick={() =>
                              run(
                                () => pickPlayer(championshipId, p.userId),
                                `${next!.team.name} escolhe ${p.nickname}?`,
                              )
                            }
                          >
                            Escolher
                          </Button>
                        )}
                        {status == null && isManager && (
                          <PotPicker championshipId={championshipId} player={p} potCount={potCount} />
                        )}
                      </li>
                    );
                  })}
                  {!list.length && <li className="px-4 py-4 text-center text-sm text-subtle">Vazio</li>}
                </ul>
              </Card>
            );
          })}
        </div>
        {status == null && isManager && pool.some((p) => p.pot == null) && (
          <Card className="mt-4">
            <CardHeader
              title="Sem pote"
              description="Escolha o pote de cada inscrito (os capitães não entram em pote)."
            />
            <ul className="grid divide-y divide-border sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-3">
              {pool
                .filter((p) => p.pot == null)
                .sort((a, b) => a.nickname.localeCompare(b.nickname, "pt-BR"))
                .map((p) => (
                  <li key={p.userId} className="flex items-center gap-2 border-border px-4 py-2 text-sm sm:border-b">
                    <Avatar name={p.nickname} src={p.avatarUrl} size="xs" />
                    <span className="min-w-0 flex-1 truncate">{p.nickname}</span>
                    <PotPicker championshipId={championshipId} player={p} potCount={potCount} />
                  </li>
                ))}
            </ul>
          </Card>
        )}
      </section>

      {/* Times */}
      {status != null && (
        <section>
          <h2 className="mb-3 font-display text-sm font-semibold tracking-wide text-muted uppercase">Times</h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {(order.length ? order : teams).map((t) => {
              const roster = active.filter((p) => p.teamId === t.id);
              const captain = t.captainId ? playerById.get(t.captainId) : null;
              return (
                <Card key={t.id} className={cn("overflow-hidden", next?.team.id === t.id && "border-brand/60")}>
                  <div className="h-1" style={{ background: t.color }} />
                  <div className="flex items-center gap-2 px-4 py-2.5">
                    <TeamChip team={t} className="flex-1" />
                    {t.draftOrder && <span className="text-xs font-semibold text-muted">{t.draftOrder}º</span>}
                  </div>
                  <ul className="divide-y divide-border border-t border-border text-sm">
                    <li className="flex items-center gap-2 px-4 py-2">
                      <Avatar name={captain?.nickname ?? "?"} src={captain?.avatarUrl ?? null} size="xs" />
                      <span className="min-w-0 flex-1 truncate">{captain?.nickname ?? "Sem capitão"}</span>
                      <Crown className="size-3.5 text-brand" aria-label="Capitão" />
                    </li>
                    {Array.from({ length: potCount }, (_, i) => i + 1).map((pot) => {
                      const pick = roster.find((p) => p.pot === pot);
                      const pl = pick ? playerById.get(pick.userId) : null;
                      return (
                        <li key={pot} className="flex items-center gap-2 px-4 py-2">
                          {pl ? (
                            <>
                              <Avatar name={pl.nickname} src={pl.avatarUrl} size="xs" />
                              <span className="min-w-0 flex-1 truncate">{pl.nickname}</span>
                            </>
                          ) : (
                            <span className="flex-1 text-subtle">—</span>
                          )}
                          <span className="text-[11px] text-subtle">P{pot}</span>
                        </li>
                      );
                    })}
                  </ul>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {/* Histórico */}
      {picks.length > 0 && (
        <Card>
          <CardHeader title="Histórico de escolhas" />
          <ol className="divide-y divide-border text-sm">
            {[...picks]
              .sort((a, b) => (a.undoneAt ? 1 : 0) - (b.undoneAt ? 1 : 0) || b.pickNo - a.pickNo)
              .map((p) => {
                const t = teamById.get(p.teamId);
                const pl = playerById.get(p.userId);
                return (
                  <li key={p.id} className={cn("flex items-center gap-3 px-4 py-2", p.undoneAt && "text-subtle")}>
                    <History className="size-3.5 shrink-0 text-subtle" aria-hidden />
                    <span className="w-14 shrink-0 font-display font-semibold tabular">#{p.pickNo}</span>
                    <span className={cn("min-w-0 flex-1 truncate", p.undoneAt && "line-through")}>
                      <span className="font-semibold" style={{ color: p.undoneAt ? undefined : t?.color }}>
                        {t?.name}
                      </span>{" "}
                      escolheu {pl?.nickname ?? "jogador"} · pote {p.pot}
                    </span>
                    {p.undoneAt && <span className="text-xs">desfeita</span>}
                  </li>
                );
              })}
          </ol>
        </Card>
      )}
    </div>
  );
}

/** Seletor do pote de um inscrito (antes do draft). */
function PotPicker({
  championshipId,
  player,
  potCount,
}: {
  championshipId: string;
  player: BoardPlayer;
  potCount: number;
}) {
  const [pending, run] = useRun();
  return (
    <Select
      aria-label={`Pote de ${player.nickname}`}
      className="h-8 w-24 text-xs"
      value={player.pot ?? ""}
      disabled={pending}
      onChange={(e) => run(() => setPot(championshipId, player.userId, e.target.value ? Number(e.target.value) : null))}
    >
      <option value="">Sem pote</option>
      {Array.from({ length: potCount }, (_, i) => (
        <option key={i + 1} value={i + 1}>
          Pote {i + 1}
        </option>
      ))}
    </Select>
  );
}
