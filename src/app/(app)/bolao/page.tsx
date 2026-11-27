import { CheckCircle2, Clock, Lock, Target } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { BET_KIND_LABEL, BOLAO_MAX, BOLAO_POINTS } from "@/lib/bolao";
import { mixHref } from "@/lib/mix-slug";
import { cn } from "@/lib/utils";
import { getDataSource } from "@/services";
import { getSession } from "@/services/auth";
import { getBolaoRanking, lastBolaoResult, loadBolao } from "@/services/bolao";
import { playerBadges } from "@/services/badges";
import { getNextMix } from "@/services/mix-events";
import { BadgeIcon } from "@/components/badges/badge-icon";

export const metadata: Metadata = { title: "Bolão" };

const pct = (n: number) => `${Math.round(n * 100)}%`;
const brDate = (iso: string) => iso.slice(0, 10).split("-").reverse().slice(0, 2).join("/");

/** "em 3 h", "em 2 dias" */
function until(to: Date, now: Date) {
  const min = Math.max(0, Math.round((to.getTime() - now.getTime()) / 60_000));
  return min < 60 ? `${min} min` : min < 48 * 60 ? `${Math.round(min / 60)} h` : `${Math.round(min / 1440)} dias`;
}

export default async function BolaoPage({ searchParams }: PageProps<"/bolao">) {
  const { ordem } = await searchParams;
  const byRate = ordem === "aproveitamento";
  const ds = getDataSource();
  const session = await getSession().catch(() => null);
  const [ranking, next, finished] = await Promise.all([
    getBolaoRanking(),
    getNextMix(session?.id ?? null).catch(() => null),
    ds.listMixes({ status: "finished" }).catch(() => []),
  ]);
  const now = ds.now();

  // Aproveitamento: pontos sobre o máximo possível nos mixes em que palpitou.
  const base = (ranking?.rows ?? []).map((r) => ({ ...r, rate: r.bets ? r.points / (r.bets * BOLAO_MAX) : 0 }));
  // Posição compartilhada só no empate completo (pontos e todos os critérios de desempate).
  const tieKey = (r: (typeof base)[number]) => `${r.points}|${r.scores}|${r.mvps}|${r.bets}`;
  const positioned = base.map((r) => {
    const shared = base.filter((x) => tieKey(x) === tieKey(r)).length > 1;
    return {
      ...r,
      position: base.findIndex((x) => tieKey(x) === tieKey(r)) + 1,
      // Empate completo: mesma posição ("=1").
      shared,
      // Mesmos pontos, separados pelo desempate.
      tiebreak: !shared && base.filter((x) => x.points === r.points).length > 1,
    };
  });
  const rows = byRate ? [...positioned].sort((a, b) => b.rate - a.rate || a.position - b.position) : positioned;

  const badges = rows.length ? await playerBadges(rows.map((r) => r.userId)).catch(() => []) : [];
  const bolaoBadges = (userId: string) => badges.filter((b) => b.userId === userId && b.rule?.startsWith("bolao_"));

  // Status do bolão do próximo mix.
  const nm = next?.status === "ok" ? next.mix : null;
  const teamsSet = nm?.draft?.status === "completed";
  const nextBolao =
    nm && teamsSet && nm.draft
      ? await loadBolao({
          scheduleId: nm.schedule.id,
          date: nm.occurrence.date,
          closesAt: nm.occurrence.eventAt,
          captains: [nm.draft.captainA, nm.draft.captainB],
          teams: [nm.draft.teamA, nm.draft.teamB],
          finalizedMatchId: nm.finalizedMatchId,
          viewerId: session?.id ?? null,
          now,
        }).catch(() => null)
      : null;

  // Último mix conferido.
  const recent = [...finished].sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt));
  const last = await lastBolaoResult(recent.map((m) => m.id)).catch(() => null);
  const lastMix = last ? recent.find((m) => m.id === last.matchId) : null;
  const nameOf = (id: string | null) => (id ? (last?.names[id] ?? "Jogador") : "—");
  const hitters = (k: "winner" | "score" | "mvp" | "lanterna") =>
    last?.entries.filter((e) => e.score?.[k]).map((e) => e.name) ?? [];

  const sortHref = (rate: boolean) => (rate ? "/bolao?ordem=aproveitamento" : "/bolao");

  return (
    <>
      <PageHeader
        title="Bolão"
        description="Palpite em todo mix, jogando ou não: vale só a glória (e a zoeira). O bolão abre quando os times são definidos e fecha no horário do mix."
      />

      {/* Bolão do próximo mix */}
      {nm && (
        <Card className={cn("mb-4", nextBolao?.status === "open" && "border-brand/50")}>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              {nextBolao?.status === "open" ? (
                <Target className="size-5 shrink-0 text-brand" aria-hidden />
              ) : nextBolao?.status === "closed" ? (
                <Lock className="size-5 shrink-0 text-muted" aria-hidden />
              ) : (
                <Clock className="size-5 shrink-0 text-muted" aria-hidden />
              )}
              <div className="min-w-0">
                <div className="font-semibold">
                  Bolão do Mix de {brDate(nm.occurrence.date)}
                  {nextBolao?.status === "open" && <span className="text-brand"> · aberto</span>}
                  {nextBolao?.status === "closed" && <span className="text-muted"> · fechado</span>}
                </div>
                <div className="text-sm text-muted">
                  {!teamsSet
                    ? "Abre quando os times forem definidos."
                    : nextBolao?.status === "open"
                      ? `Fecha em ${until(nm.occurrence.eventAt, now)} (no horário do mix) · ${nextBolao.total} palpite${nextBolao.total === 1 ? "" : "s"}`
                      : "Aguardando o resultado do mix."}
                </div>
              </div>
            </div>
            {nextBolao?.status === "open" &&
              (nextBolao.mine ? (
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-win">
                  <CheckCircle2 className="size-4" aria-hidden /> Você já palpitou
                  <Link href="/dashboard#bolao" className="ml-2 text-xs font-normal text-muted underline">
                    mudar
                  </Link>
                </span>
              ) : (
                <Button variant="primary" asChild>
                  <Link href="/dashboard#bolao">
                    <Target /> Dar meu palpite
                  </Link>
                </Button>
              ))}
          </CardContent>
        </Card>
      )}

      <Card className="mb-4">
        <CardContent className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <span>
            Vencedor ou empate <strong className="text-brand">+{BOLAO_POINTS.winner}</strong>
          </span>
          <span>
            Vitória seca ou com deslize <strong className="text-brand">+{BOLAO_POINTS.score}</strong>
            <span className="text-muted"> (com o vencedor certo; empate certo já leva)</span>
          </span>
          <span>
            MVP <strong className="text-brand">+{BOLAO_POINTS.mvp}</strong>
          </span>
          <span>
            Lanterna <strong className="text-brand">+{BOLAO_POINTS.lanterna}</strong>
          </span>
          <span className="text-muted">Máximo de {BOLAO_MAX} pontos por mix.</span>
        </CardContent>
      </Card>

      {/* Último mix conferido */}
      {last && (
        <Card className="mb-4">
          <CardHeader
            title={`Último conferido · ${lastMix?.name ?? "Mix"}`}
            description="Resultado oficial e quem acertou cada item."
            action={
              lastMix ? (
                <Link href={mixHref(lastMix)} className="text-xs text-muted hover:text-brand">
                  Ver o mix →
                </Link>
              ) : undefined
            }
          />
          <CardContent className="grid gap-3 pt-3 sm:grid-cols-2 lg:grid-cols-4">
            {(
              [
                [
                  "Vencedor",
                  last.outcome.kind === "draw"
                    ? "Empate"
                    : last.outcome.winnerCaptain
                      ? `Time de ${nameOf(last.outcome.winnerCaptain)}`
                      : "—",
                  "winner",
                ],
                [
                  "Como foi",
                  last.outcome.kind
                    ? `${BET_KIND_LABEL[last.outcome.kind]} (${last.outcome.mapsWon}×${last.outcome.mapsLost})`
                    : "—",
                  "score",
                ],
                ["MVP", nameOf(last.outcome.mvpId), "mvp"],
                ["Lanterna", nameOf(last.outcome.lanternaId), "lanterna"],
              ] as const
            ).map(([label, value, key]) => {
              const who = hitters(key);
              return (
                <div key={key} className="rounded-lg border border-border bg-surface-2/50 px-3 py-2">
                  <div className="text-[11px] font-semibold tracking-wider text-muted uppercase">{label}</div>
                  <div className="truncate font-semibold" title={value}>
                    {value}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-muted" title={who.join(", ")}>
                    {who.length ? (
                      <>
                        <span className="text-win">✓ {who.length}</span> · {who.slice(0, 3).join(", ")}
                        {who.length > 3 ? ` +${who.length - 3}` : ""}
                      </>
                    ) : (
                      <span className="text-loss">ninguém acertou</span>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <Card>
        {rows.length ? (
          <Table>
            <THead>
              <TR>
                <TH className="w-14 text-center">#</TH>
                <TH className="min-w-36">Palpiteiro</TH>
                <TH className="text-right">
                  <Link href={sortHref(false)} className={cn("hover:text-fg", !byRate && "text-brand")}>
                    Pontos{!byRate && " ↓"}
                  </Link>
                </TH>
                <TH className="text-right" title="Pontos sobre o máximo possível nos mixes em que palpitou">
                  <Link href={sortHref(true)} className={cn("hover:text-fg", byRate && "text-brand")}>
                    Aproveit.{byRate && " ↓"}
                  </Link>
                </TH>
                <TH className="hidden text-right sm:table-cell" title="Mixes em que palpitou (finalizados)">
                  Palpites
                </TH>
                <TH className="hidden text-right sm:table-cell" title="Acertos do resultado (vencedor ou empate)">
                  Vencedor
                </TH>
                <TH
                  className="hidden text-right sm:table-cell"
                  title="Acertou também como foi: vitória seca, com deslize ou empate"
                >
                  Seca/deslize
                </TH>
                <TH className="hidden text-right sm:table-cell">MVP</TH>
                <TH className="hidden text-right sm:table-cell">Lanterna</TH>
              </TR>
            </THead>
            <tbody>
              {rows.map((r) => {
                const me = session?.id === r.userId;
                return (
                  <TR key={r.userId} className={cn("hover:bg-surface-2/50", me && "bg-brand/8 hover:bg-brand/12")}>
                    <TD className="text-center">
                      <span
                        title={
                          r.shared
                            ? "Empatado em tudo (pontos e critérios de desempate): mesma posição"
                            : r.tiebreak
                              ? "Mesmos pontos: desempate por seca/deslize, depois MVP, depois menos palpites"
                              : undefined
                        }
                        className={cn(
                          "inline-flex size-7 items-center justify-center rounded-sm font-display text-sm font-bold tabular",
                          r.position === 1 && "bg-brand text-brand-fg",
                          r.position === 2 && "bg-brand/25 text-brand",
                          r.position === 3 && "bg-brand/12 text-brand",
                          r.position > 3 && "text-muted",
                          (r.shared || r.tiebreak) && "cursor-help",
                        )}
                      >
                        {r.position}
                      </span>
                    </TD>
                    <TD>
                      <div className="flex items-center gap-2.5">
                        <Avatar name={r.name} src={r.avatarUrl} size="sm" />
                        <span className="max-w-28 truncate font-medium sm:max-w-none">{r.name}</span>
                        {me && (
                          <span className="shrink-0 rounded bg-brand/15 px-1 text-[10px] font-bold text-brand uppercase">
                            você
                          </span>
                        )}
                        {bolaoBadges(r.userId).map((b) => (
                          <BadgeIcon
                            key={b.id}
                            icon={b.icon}
                            color={b.color}
                            size="xs"
                            className="cursor-help"
                            title={`${b.name}${b.reason ? ` — ${b.reason}` : ""}`}
                          />
                        ))}
                      </div>
                    </TD>
                    <TD className="text-right font-display text-base font-bold">{r.points}</TD>
                    <TD className="text-right tabular" title={`${r.points} de ${r.bets * BOLAO_MAX} possíveis`}>
                      <span className={r.rate >= 0.5 ? "text-win" : r.rate >= 0.25 ? "text-yellow-400" : "text-loss"}>
                        {pct(r.rate)}
                      </span>
                    </TD>
                    <TD className="hidden text-right text-muted sm:table-cell">{r.bets}</TD>
                    <TD className="hidden text-right sm:table-cell">
                      {r.winners}
                      <span className="text-xs text-subtle"> ({pct(r.winners / r.bets)})</span>
                    </TD>
                    <TD className="hidden text-right sm:table-cell">{r.scores}</TD>
                    <TD className="hidden text-right sm:table-cell">{r.mvps}</TD>
                    <TD className="hidden text-right sm:table-cell">{r.lanternas}</TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        ) : (
          <EmptyState
            icon={Target}
            title={ranking ? "Nenhum bolão conferido ainda" : "Bolão indisponível"}
            description={
              ranking
                ? "Quando os times do próximo mix forem definidos, o bolão abre no Dashboard."
                : "Rode a migração 0031_bolao_push.sql no Supabase."
            }
            className="py-10"
          />
        )}
      </Card>
      {ranking && ranking.mixes > 0 && (
        <p className="mt-2 text-xs text-subtle">
          {ranking.mixes} mix{ranking.mixes > 1 ? "es" : ""} conferido{ranking.mixes > 1 ? "s" : ""}. Mesmos pontos:
          desempate por seca/deslize, depois MVP, depois menos palpites; empatados em tudo dividem a posição.
          Aproveitamento = pontos ÷ máximo possível ({BOLAO_MAX} por mix). Insígnias do bolão: Rei do Pitaco, Alambrado
          do Mix, Mãe Diná, Zicado e Chutômetro Quebrado. Os pontos seguem o resultado oficial: se um mix for corrigido,
          o bolão é recalculado.
        </p>
      )}
    </>
  );
}
