import { CalendarClock, ChevronRight, Users } from "lucide-react";
import Link from "next/link";
import type { UpcomingOccurrence } from "@/services/mix-events";
import { Badge } from "../ui/badge";
import { EmptyState } from "../ui/empty-state";

const WEEKDAY = new Intl.DateTimeFormat("pt-BR", { weekday: "long", timeZone: "America/Sao_Paulo" });
const TIME = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
const DAY = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });

/** Próximos mixes das agendas ativas (criados no painel admin). */
export function UpcomingList({ items, now }: { items: UpcomingOccurrence[]; now: Date }) {
  if (!items.length) {
    return (
      <EmptyState
        icon={CalendarClock}
        title="Nenhum mix agendado"
        description="Os mixes criados no painel administrativo aparecem aqui."
      />
    );
  }
  return (
    <ul className="divide-y divide-border">
      {items.map((o) => {
        const started = now >= o.eventAt;
        const open = now >= o.opensAt;
        const [y, m, d] = o.date.split("-");
        return (
          <li key={`${o.scheduleId}-${o.date}`}>
            <Link
              href="/dashboard"
              className="group grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-3 transition-colors hover:bg-surface-2 sm:grid-cols-[9rem_1fr_auto_auto]"
            >
              <div className="min-w-0">
                <div className="font-medium text-fg">
                  Mix de {d}/{m}
                </div>
                <div className="text-xs text-muted">
                  {WEEKDAY.format(o.eventAt).replace(/^./, (c) => c.toUpperCase())}, {o.eventTime}
                </div>
              </div>
              <div className="col-span-2 row-start-2 min-w-0 text-sm text-muted sm:col-span-1 sm:row-start-auto">
                <span>{o.recurrence}</span>
                <span className="text-subtle"> · </span>
                {started ? (
                  <span>em andamento</span>
                ) : open ? (
                  <span className="text-win">inscrições abertas</span>
                ) : (
                  <span>
                    inscrições em {DAY.format(o.opensAt)} às {TIME.format(o.opensAt)}
                  </span>
                )}
                <span className="sr-only"> ({y})</span>
              </div>
              <div className="flex items-center justify-end gap-2">
                <span className="flex items-center gap-1 text-sm text-muted tabular">
                  <Users className="size-3.5" aria-hidden /> {o.players}/{o.maxPlayers}
                </span>
                <Badge variant={started ? "brand" : "neutral"}>{started ? "Ao vivo" : "Agendado"}</Badge>
              </div>
              <ChevronRight
                className="hidden size-4 text-subtle transition-colors group-hover:text-brand sm:block"
                aria-hidden
              />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
