import { ScrollText } from "lucide-react";
import Link from "next/link";
import { auditLabel, DETAIL_KEYS, isSuccess, outcomeLabel } from "@/lib/audit-labels";
import { mapName } from "@/lib/maps";
import { cn } from "@/lib/utils";
import type { AuditRow } from "@/services/audit-log";
import type { MapId } from "@/types/domain";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardHeader } from "../ui/card";
import { EmptyState } from "../ui/empty-state";
import { FilterTabs } from "../ui/filter-tabs";
import { AuditFilters } from "./audit-filters";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TZ = "America/Sao_Paulo";
const dayFmt = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "short", timeZone: TZ });
const timeFmt = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
const dayKey = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(iso));

/** Detalhe em português: ids viram nomes, mapas viram nomes de mapa e o mix vira link. */
function Detail({ detail, names }: { detail: Record<string, unknown> | null; names: Map<string, string> }) {
  if (!detail) return null;
  const fmt = (k: string, v: unknown): string => {
    if (typeof v === "boolean") return v ? "sim" : "não";
    if (typeof v === "string") {
      if (UUID.test(v)) return names.get(v) ?? "…";
      if (/^de_[a-z0-9]+$/.test(v)) return mapName(v as MapId);
      return v.length > 70 ? `${v.slice(0, 67)}…` : v;
    }
    if (Array.isArray(v)) return v.length > 8 ? `${v.length} itens` : v.map((x) => fmt(k, x)).join(", ");
    if (v && typeof v === "object") return JSON.stringify(v).slice(0, 60);
    return String(v);
  };
  const matchId = [detail.match_id, detail.matchId].find((v) => typeof v === "string" && UUID.test(v)) as
    string | undefined;
  const parts = Object.entries(detail)
    .filter(
      ([k, v]) => v != null && v !== "" && k !== "match_id" && k !== "matchId" && !/(^|_)user_?id$|userId$/i.test(k),
    )
    .slice(0, 8);
  return (
    <>
      {parts.map(([k, v], i) => (
        <span key={k}>
          {i > 0 && " · "}
          <span className="text-subtle">{DETAIL_KEYS[k] ?? k.replace(/_/g, " ")}:</span> {fmt(k, v)}
        </span>
      ))}
      {matchId && (
        <>
          {parts.length > 0 && " · "}
          <Link href={`/mixes/${matchId}`} className="text-brand hover:underline">
            ver o mix →
          </Link>
        </>
      )}
    </>
  );
}

type Item = { kind: "row"; row: AuditRow } | { kind: "group"; rows: AuditRow[] };

/** Votos seguidos do mesmo tipo e do mesmo mix viram uma linha só (que abre os detalhes). */
function collapse(rows: AuditRow[]): Item[] {
  const out: Item[] = [];
  for (const r of rows) {
    const last = out.at(-1);
    const groupable = r.action.startsWith("vote.") && isSuccess(r.outcome);
    if (groupable && last) {
      const head = last.kind === "group" ? last.rows[0]! : last.row;
      if (
        head.action === r.action &&
        head.eventDate === r.eventDate &&
        isSuccess(head.outcome) &&
        dayKey(head.createdAt) === dayKey(r.createdAt)
      ) {
        if (last.kind === "group") last.rows.push(r);
        else out[out.length - 1] = { kind: "group", rows: [head, r] };
        continue;
      }
    }
    out.push({ kind: "row", row: r });
  }
  return out;
}

const mixOf = (r: AuditRow) => (r.eventDate ? ` · mix ${r.eventDate.split("-").reverse().slice(0, 2).join("/")}` : "");

function Row({ r, names }: { r: AuditRow; names: Map<string, string> }) {
  const ok = isSuccess(r.outcome);
  return (
    <li
      className={cn(
        "grid grid-cols-[3rem_minmax(0,1fr)] gap-x-3 gap-y-0.5 px-4 py-2 text-sm sm:grid-cols-[3rem_9rem_minmax(0,16rem)_1fr]",
        !ok && "bg-loss/8",
      )}
    >
      <span className="text-xs text-muted tabular sm:pt-0.5">{timeFmt.format(new Date(r.createdAt))}</span>
      <span className="truncate font-medium">{r.actorName ?? <span className="text-subtle">—</span>}</span>
      <span className="col-start-2 sm:col-start-auto">
        {auditLabel(r.action)}
        <span className="text-xs text-muted">{mixOf(r)}</span>
        {!ok && (
          <Badge variant="loss" className="ml-1.5">
            {outcomeLabel(r.outcome)}
          </Badge>
        )}
      </span>
      <span className="col-start-2 text-xs text-muted sm:col-start-auto">
        <Detail detail={r.detail} names={names} />
      </span>
    </li>
  );
}

export function AuditLogTable({
  rows,
  names,
  hasMore,
  page,
  filters,
  players,
}: {
  rows: AuditRow[];
  names: Map<string, string>;
  hasMore: boolean;
  page: number;
  filters: Record<string, string | undefined>;
  players: { id: string; name: string }[];
}) {
  const href = (over: Record<string, string | null>) => {
    const q = new URLSearchParams({ aba: "logs" });
    for (const [k, v] of Object.entries({ ...filters, ...over })) if (v) q.set(k, v);
    return `/admin?${q}`;
  };
  const items = collapse(rows);
  const firstOf = (it: Item) => (it.kind === "row" ? it.row : it.rows[0]!);
  return (
    <Card>
      <CardHeader
        title="Logs de auditoria"
        description="Da mais recente para a mais antiga. Em vermelho: o que foi recusado ou deu erro."
        action={
          <FilterTabs
            label="Quem fez"
            current={filters.grupo ?? "admin"}
            options={[
              { value: "admin", label: "Admin", href: href({ grupo: null, pagina: null }) },
              { value: "jogadores", label: "Jogadores", href: href({ grupo: "jogadores", pagina: null }) },
              { value: "tudo", label: "Tudo", href: href({ grupo: "tudo", pagina: null }) },
            ]}
          />
        }
      />
      <AuditFilters players={players} />
      {items.length ? (
        <ul>
          {items.map((it, i) => {
            const head = firstOf(it);
            const newDay = i === 0 || dayKey(firstOf(items[i - 1]!).createdAt) !== dayKey(head.createdAt);
            return (
              <li key={head.id} className="border-b border-border last:border-0">
                {newDay && (
                  <div className="border-b border-border bg-surface-2/60 px-4 py-1.5 text-[11px] font-bold tracking-wider text-muted uppercase">
                    {dayFmt.format(new Date(head.createdAt)).replace(".", "")}
                  </div>
                )}
                {it.kind === "row" ? (
                  <ul>
                    <Row r={it.row} names={names} />
                  </ul>
                ) : (
                  <details className="group">
                    <summary className="grid cursor-pointer list-none grid-cols-[3rem_minmax(0,1fr)] gap-x-3 px-4 py-2 text-sm hover:bg-surface-2/50 sm:grid-cols-[3rem_9rem_minmax(0,16rem)_1fr] [&::-webkit-details-marker]:hidden">
                      <span
                        className="text-xs text-muted tabular"
                        title={`${timeFmt.format(new Date(it.rows.at(-1)!.createdAt))} até ${timeFmt.format(new Date(head.createdAt))}`}
                      >
                        {timeFmt.format(new Date(it.rows.at(-1)!.createdAt))}
                      </span>
                      <span className="font-medium">{new Set(it.rows.map((r) => r.actorId)).size} jogadores</span>
                      <span className="col-start-2 sm:col-start-auto">
                        {auditLabel(head.action)}
                        <span className="text-xs text-muted">{mixOf(head)}</span>
                      </span>
                      <span className="col-start-2 text-xs text-brand sm:col-start-auto">
                        <span className="group-open:hidden">ver os {it.rows.length} →</span>
                        <span className="hidden group-open:inline">esconder</span>
                      </span>
                    </summary>
                    <ul className="border-t border-border bg-surface-2/30">
                      {it.rows.map((r) => (
                        <Row key={r.id} r={r} names={names} />
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState icon={ScrollText} title="Nenhum registro encontrado" className="py-10" />
      )}
      <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm">
        <span className="text-muted">Página {page}</span>
        <div className="flex gap-2">
          {page > 1 && (
            <Button variant="secondary" size="sm" asChild>
              <Link href={href({ pagina: String(page - 1) })}>Anterior</Link>
            </Button>
          )}
          {hasMore && (
            <Button variant="secondary" size="sm" asChild>
              <Link href={href({ pagina: String(page + 1) })}>Próxima</Link>
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
