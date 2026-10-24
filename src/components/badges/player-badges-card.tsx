import { ChevronDown } from "lucide-react";
import { formatDate } from "@/lib/format";
import type { Badge, BadgeProgressView, PlayerBadge } from "@/services/badges";
import { Card, CardHeader } from "../ui/card";
import { BadgeIcon } from "./badge-icon";

/** Quantas insígnias em andamento aparecem antes do "Ver todas". */
const VISIBLE_PROGRESS = 6;

/**
 * Insígnias no perfil, compactas: conquistadas (ativas e permanentes) em
 * grade; em andamento, das mais perto às mais longe; as disputadas a cada mix
 * (0/1) numa linha de ícones; histórico recolhido.
 */
export function PlayerBadgesCard({
  badges,
  catalog,
  progress,
}: {
  /** Todas as conquistas do jogador, inclusive encerradas. */
  badges: PlayerBadge[];
  catalog: Badge[];
  progress: BadgeProgressView[];
}) {
  const active = badges
    .filter((b) => !b.deactivatedAt)
    // Dinâmicas primeiro (fase atual), depois as permanentes.
    .sort((a, b) => Number(a.kind === "permanent") - Number(b.kind === "permanent") || b.priority - a.priority);
  const history = badges.filter((b) => b.deactivatedAt);
  const owned = new Set(active.map((b) => b.badgeId));
  const pending = progress
    .map((p) => ({ p, badge: catalog.find((b) => b.id === p.badgeId) }))
    .filter(
      (x): x is { p: BadgeProgressView; badge: Badge } =>
        !!x.badge && x.badge.enabled && !owned.has(x.badge.id) && x.p.current < x.p.target,
    );
  // "Ser o X do próximo mix" (0/1): só ícones, para não ocupar uma linha cada.
  const nextMix = pending.filter(({ p }) => p.target === 1);
  const inProgress = pending
    .filter(({ p }) => p.target > 1)
    .sort((a, b) => b.p.current / b.p.target - a.p.current / a.p.target);
  if (!badges.length && !pending.length) return null;

  return (
    <Card className="mt-4">
      <CardHeader
        title={`Insígnias${active.length ? ` · ${active.length}` : ""}`}
        description="Dinâmicas acompanham a fase atual e podem ser perdidas; permanentes ficam para sempre."
      />
      <div className="space-y-5 p-4">
        <section>
          <Heading>Conquistadas</Heading>
          {active.length ? (
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {active.map((b) => (
                <Owned key={b.id} badge={b} />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-subtle">Nenhuma insígnia no momento.</p>
          )}
        </section>

        {inProgress.length > 0 && (
          <section>
            <Heading>Em andamento</Heading>
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {inProgress.slice(0, VISIBLE_PROGRESS).map((x) => (
                <Progress key={x.badge.id} {...x} />
              ))}
            </ul>
            {inProgress.length > VISIBLE_PROGRESS && (
              <details className="group mt-2">
                <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-muted hover:text-fg [&::-webkit-details-marker]:hidden">
                  <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" aria-hidden />
                  <span className="group-open:hidden">Ver todas ({inProgress.length})</span>
                  <span className="hidden group-open:inline">Ver menos</span>
                </summary>
                <ul className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {inProgress.slice(VISIBLE_PROGRESS).map((x) => (
                    <Progress key={x.badge.id} {...x} />
                  ))}
                </ul>
              </details>
            )}
          </section>
        )}

        {nextMix.length > 0 && (
          <section>
            <Heading>Em disputa no próximo mix</Heading>
            <ul className="flex flex-wrap gap-1.5">
              {nextMix.map(({ p, badge }) => (
                <li
                  key={badge.id}
                  title={`${badge.name}: ${p.detail}`}
                  className="flex items-center gap-1.5 rounded-md border border-border bg-surface-2/50 py-1 pr-2.5 pl-1 text-xs text-muted"
                >
                  <BadgeIcon icon={badge.icon} color={badge.color} size="xs" className="opacity-60 grayscale" />
                  {badge.name}
                </li>
              ))}
            </ul>
          </section>
        )}

        {history.length > 0 && (
          <details className="group border-t border-border pt-3">
            <summary className="flex cursor-pointer list-none items-center gap-1 text-[11px] font-semibold tracking-wider text-muted uppercase hover:text-fg [&::-webkit-details-marker]:hidden">
              <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" aria-hidden />
              Histórico ({history.length})
            </summary>
            <ul className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {history.map((b) => (
                <li key={b.id} className="flex items-start gap-2 text-sm">
                  <BadgeIcon icon={b.icon} color={b.color} size="xs" className="opacity-50 grayscale" />
                  <div className="min-w-0">
                    <div className="truncate font-medium text-muted">{b.name}</div>
                    <div className="text-xs text-subtle">
                      {formatDate(b.createdAt)} → {formatDate(b.deactivatedAt!)}
                      {b.endReason && ` · ${b.endReason}`}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </Card>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 text-[11px] font-semibold tracking-wider text-muted uppercase">{children}</h3>;
}

function Owned({ badge }: { badge: PlayerBadge }) {
  const detail = badge.reason ?? badge.note ?? badge.description;
  return (
    <li
      className="flex items-center gap-2.5 rounded-md border border-border bg-surface-2/40 px-2.5 py-2"
      title={[detail, badge.unlock && `Desbloqueio: ${badge.unlock}`].filter(Boolean).join("\n")}
    >
      <BadgeIcon icon={badge.icon} color={badge.color} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium" style={{ color: badge.color }}>
            {badge.name}
          </span>
          {badge.kind === "permanent" && (
            <span className="shrink-0 rounded-sm bg-surface-3 px-1 text-[9px] font-semibold tracking-wide text-muted uppercase">
              Perm.
            </span>
          )}
        </div>
        <div className="truncate text-[11px] text-subtle">
          {detail ? `${detail} · ` : ""}desde {formatDate(badge.createdAt)}
        </div>
      </div>
    </li>
  );
}

function Progress({ p, badge }: { p: BadgeProgressView; badge: Badge }) {
  return (
    <li
      className="flex items-center gap-2.5 rounded-md border border-border px-2.5 py-2"
      title={`${badge.name}: ${p.detail}`}
    >
      <BadgeIcon icon={badge.icon} color={badge.color} size="sm" className="opacity-60 grayscale" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="truncate font-medium">{badge.name}</span>
          <span className="shrink-0 text-xs text-muted tabular">
            {p.current}/{p.target}
          </span>
        </div>
        {p.detail && <div className="truncate text-[11px] text-subtle">{p.detail}</div>}
        <div className="mt-1 h-1 rounded-full bg-surface-3">
          <div
            className="h-full rounded-full bg-brand"
            style={{ width: `${Math.round((p.current / p.target) * 100)}%` }}
          />
        </div>
      </div>
    </li>
  );
}
