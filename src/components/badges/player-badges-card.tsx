import { formatDate } from "@/lib/format";
import type { Badge, BadgeProgressView, PlayerBadge } from "@/services/badges";
import { Card, CardHeader } from "../ui/card";
import { BadgeIcon } from "./badge-icon";

/**
 * Insígnias no perfil: ativas agora (dinâmicas), permanentes, em andamento
 * (progresso) e histórico das dinâmicas que já foram perdidas.
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
  const active = badges.filter((b) => !b.deactivatedAt);
  const dynamic = active.filter((b) => b.kind === "dynamic");
  const permanent = active.filter((b) => b.kind === "permanent");
  const history = badges.filter((b) => b.deactivatedAt);
  const owned = new Set(active.map((b) => b.badgeId));
  // Progresso só do que ainda não está ativo; Pé Frio não aparece como "meta".
  const inProgress = progress
    .map((p) => ({ p, badge: catalog.find((b) => b.id === p.badgeId) }))
    .filter(
      (x): x is { p: BadgeProgressView; badge: Badge } =>
        !!x.badge &&
        x.badge.enabled &&
        x.badge.autoRule !== "loss_streak" &&
        !owned.has(x.badge.id) &&
        x.p.current > 0 &&
        x.p.current < x.p.target,
    );
  if (!badges.length && !inProgress.length) return null;

  return (
    <Card className="mt-4">
      <CardHeader
        title="Insígnias"
        description="Dinâmicas acompanham a fase atual e podem ser perdidas; permanentes ficam para sempre."
      />
      <div className="grid gap-4 p-4 md:grid-cols-2">
        <Group title="Ativas agora" empty="Nenhuma insígnia dinâmica no momento.">
          {dynamic.map((b) => (
            <Item key={b.id} badge={b} detail={b.reason ?? b.description} />
          ))}
        </Group>
        <Group title="Permanentes" empty="Nenhuma conquista permanente ainda.">
          {permanent.map((b) => (
            <Item key={b.id} badge={b} detail={b.reason ?? b.note ?? b.description} />
          ))}
        </Group>
        {inProgress.length > 0 && (
          <Group title="Em andamento">
            {inProgress.map(({ p, badge }) => (
              <li key={badge.id} className="flex items-center gap-2.5">
                <BadgeIcon icon={badge.icon} color={badge.color} size="sm" className="opacity-60 grayscale" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate font-medium">{badge.name}</span>
                    <span className="text-xs text-muted tabular">
                      {p.current}/{p.target}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full bg-brand"
                      style={{ width: `${Math.round((p.current / p.target) * 100)}%` }}
                    />
                  </div>
                </div>
              </li>
            ))}
          </Group>
        )}
        {history.length > 0 && (
          <Group title="Histórico">
            {history.map((b) => (
              <li key={b.id} className="flex items-start gap-2.5 text-sm">
                <BadgeIcon icon={b.icon} color={b.color} size="sm" className="opacity-50 grayscale" />
                <div className="min-w-0">
                  <div className="font-medium text-muted">{b.name}</div>
                  <div className="text-xs text-subtle">
                    {formatDate(b.createdAt)} → {formatDate(b.deactivatedAt!)}
                    {b.endReason && ` · ${b.endReason}`}
                  </div>
                </div>
              </li>
            ))}
          </Group>
        )}
      </div>
    </Card>
  );
}

function Group({ title, empty, children }: { title: string; empty?: string; children: React.ReactNode[] }) {
  return (
    <section>
      <h3 className="mb-2 text-[11px] font-semibold tracking-wider text-muted uppercase">{title}</h3>
      {children.length ? <ul className="space-y-2.5">{children}</ul> : <p className="text-sm text-subtle">{empty}</p>}
    </section>
  );
}

function Item({ badge, detail }: { badge: PlayerBadge; detail: string | null }) {
  return (
    <li className="flex items-start gap-2.5" title={badge.unlock ? `Desbloqueio: ${badge.unlock}` : undefined}>
      <BadgeIcon icon={badge.icon} color={badge.color} size="sm" />
      <div className="min-w-0 text-sm">
        <div className="font-medium" style={{ color: badge.color }}>
          {badge.name}
        </div>
        <div className="text-xs text-muted">
          {detail}
          {detail ? " · " : ""}desde {formatDate(badge.createdAt)}
        </div>
      </div>
    </li>
  );
}
