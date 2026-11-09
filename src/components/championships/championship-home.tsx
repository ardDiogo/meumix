import { CalendarDays, ChevronRight, Coins, LogIn, Trophy, Users } from "lucide-react";
import Link from "next/link";
import { formatMoney, PLAYOFF_TEAMS, prizeDistribution } from "@/lib/championship";
import type { HomeChampionship } from "@/services/championship-home";
import { Button } from "../ui/button";
import { formatDateRange } from "./format";
import { RegisterButton } from "./register-button";
import { ChampionshipStatusBadge } from "./status-badge";

/** Campeonatos em destaque no Dashboard, com o botão de inscrição. */
export function ChampionshipHome({ items, loggedIn }: { items: HomeChampionship[]; loggedIn: boolean }) {
  if (!items.length) return null;
  return (
    <section aria-label="Campeonatos" className="space-y-3">
      {items.map((item) => (
        <ChampionshipCard key={item.championship.id} item={item} loggedIn={loggedIn} />
      ))}
    </section>
  );
}

function ChampionshipCard({ item, loggedIn }: { item: HomeChampionship; loggedIn: boolean }) {
  const { championship: c, registered, vagas, mine } = item;
  const href = `/campeonatos/${c.slug}`;
  const dates = formatDateRange(c.startsOn, c.endsOn);
  const prize = c.entryFee > 0 ? prizeDistribution(c.entryFee, vagas, c.prizeSplit, c.costs) : null;
  const open =
    c.teamMode === "draft" ? c.status === "registration" : c.status === "registration" || c.status === "teams";
  const full = registered >= vagas;
  const pct = Math.min(100, Math.round((registered / Math.max(vagas, 1)) * 100));
  const playoffTeams = PLAYOFF_TEAMS[c.playoffFormat];
  const playoffs =
    playoffTeams === 2 ? "final entre os 2 primeiros" : playoffTeams ? `playoffs com ${playoffTeams} times` : null;

  return (
    <article className="overflow-hidden rounded-lg border border-brand/30 bg-surface">
      <div className="flex flex-col sm:flex-row">
        <Link
          href={href}
          className="relative h-28 shrink-0 overflow-hidden bg-gradient-to-br from-brand/30 via-surface-2 to-surface sm:h-auto sm:w-56"
        >
          {c.hasBanner ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/campeonatos/${c.id}/banner?v=${encodeURIComponent(c.updatedAt)}`}
              alt=""
              className="size-full object-cover"
            />
          ) : (
            <Trophy className="absolute top-1/2 left-1/2 size-10 -translate-x-1/2 -translate-y-1/2 text-brand/70" />
          )}
          <span className="absolute top-2 left-2">
            <ChampionshipStatusBadge status={c.status} />
          </span>
        </Link>

        <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
          <div>
            <div className="text-[11px] font-semibold tracking-wider text-brand uppercase">
              Campeonato{c.edition ? ` · ${c.edition}` : ""}
            </div>
            <Link href={href} className="font-display text-xl leading-tight font-bold hover:text-brand">
              {c.name}
            </Link>
            {c.description && <p className="mt-1 line-clamp-2 text-sm text-muted">{c.description}</p>}
          </div>

          <dl className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-muted">
            <Info icon={Users}>
              {c.teamCount} times · 5x5{playoffs ? ` · ${playoffs}` : ""}
            </Info>
            {dates && <Info icon={CalendarDays}>{dates}</Info>}
            {c.entryFee > 0 && (
              <Info icon={Coins}>
                Inscrição {formatMoney(c.entryFee)}
                {prize?.prizes[0] ? ` · 1º lugar ${formatMoney(prize.prizes[0])}` : ""}
              </Info>
            )}
          </dl>

          {open && (
            <div>
              <div className="mb-1 flex justify-between text-xs">
                <span className="text-muted">{c.teamMode === "draft" ? "Inscritos" : "Jogadores nos times"}</span>
                <span className="font-semibold tabular">
                  {registered}/{vagas}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
              </div>
            </div>
          )}

          <div className="mt-auto flex flex-wrap items-center gap-2">
            {!loggedIn ? (
              open && (
                <Button variant="primary" asChild>
                  <Link href={`/entrar?next=${encodeURIComponent("/dashboard")}`}>
                    <LogIn /> Entrar para se inscrever
                  </Link>
                </Button>
              )
            ) : c.teamMode === "draft" ? (
              open ? (
                <RegisterButton championshipId={c.id} registered={!!mine?.registered} full={full} />
              ) : (
                mine?.registered && (
                  <span className="text-sm font-medium text-win">
                    Você está no campeonato{mine.team ? ` · ${mine.team}` : ""}
                  </span>
                )
              )
            ) : mine?.registered ? (
              <span className="text-sm font-medium text-win">Você está no time {mine.team ?? ""}</span>
            ) : (
              open && (
                <Button variant="primary" asChild>
                  <Link href={`${href}/equipes`}>
                    <LogIn /> Inscrever-se com o código do time
                  </Link>
                </Button>
              )
            )}
            <Button variant="secondary" asChild>
              <Link href={href}>
                Ver campeonato <ChevronRight />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
}

function Info({ icon: Icon, children }: { icon: typeof Users; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </div>
  );
}
