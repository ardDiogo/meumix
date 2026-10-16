import { ScrollText } from "lucide-react";
import Link from "next/link";
import { auditLabel, AUDIT_CATEGORIES, isSuccess, outcomeLabel } from "@/lib/audit-labels";
import { formatDateTime } from "@/lib/format";
import type { AuditRow } from "@/services/audit-log";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardHeader } from "../ui/card";
import { EmptyState } from "../ui/empty-state";
import { Select } from "../ui/input";
import { Table, TD, TH, THead, TR } from "../ui/table";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Detalhe resumido: troca ids de jogador pelo nick e corta textos longos. */
function describe(detail: Record<string, unknown> | null, names: Map<string, string>) {
  if (!detail) return "";
  const fmt = (v: unknown): string => {
    if (typeof v === "string") return UUID.test(v) ? (names.get(v) ?? "…") : v.length > 60 ? `${v.slice(0, 57)}…` : v;
    if (Array.isArray(v)) return v.length > 6 ? `${v.length} itens` : v.map(fmt).join(", ");
    if (v && typeof v === "object") return JSON.stringify(v).slice(0, 60);
    return String(v);
  };
  return Object.entries(detail)
    .filter(([, v]) => v != null && v !== "")
    .slice(0, 5)
    .map(([k, v]) => `${k}: ${fmt(v)}`)
    .join(" · ");
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
  filters: { categoria?: string; resultado?: string; jogador?: string };
  players: { id: string; name: string }[];
}) {
  const href = (p: number) => {
    const q = new URLSearchParams({ aba: "logs", ...filters, pagina: String(p) });
    for (const [k, v] of [...q.entries()]) if (!v) q.delete(k);
    return `/admin?${q}`;
  };
  return (
    <Card>
      <CardHeader
        title="Logs de auditoria"
        description="Inscrições, votações e ações de administração, da mais recente para a mais antiga."
      />
      <form action="/admin" className="flex flex-wrap items-end gap-2 border-b border-border px-4 pb-4">
        <input type="hidden" name="aba" value="logs" />
        <Select name="categoria" defaultValue={filters.categoria ?? ""} aria-label="Categoria" className="w-52">
          <option value="">Todas as categorias</option>
          {Object.entries(AUDIT_CATEGORIES).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
        <Select name="resultado" defaultValue={filters.resultado ?? ""} aria-label="Resultado" className="w-52">
          <option value="">Todos os resultados</option>
          <option value="sucesso">Sucesso</option>
          <option value="recusado">Recusado / erro</option>
        </Select>
        <Select name="jogador" defaultValue={filters.jogador ?? ""} aria-label="Jogador" className="w-52">
          <option value="">Todos os jogadores</option>
          {players.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="secondary" size="sm">
          Filtrar
        </Button>
      </form>
      {rows.length ? (
        <div className="overflow-x-auto">
          <Table>
            <THead>
              <TR>
                <TH>Quando</TH>
                <TH>Quem</TH>
                <TH>Ação</TH>
                <TH>Resultado</TH>
                <TH className="min-w-72">Detalhes</TH>
              </TR>
            </THead>
            <tbody>
              {rows.map((r) => (
                <TR key={r.id}>
                  <TD className="text-xs whitespace-nowrap text-muted">{formatDateTime(r.createdAt)}</TD>
                  <TD className="font-medium whitespace-nowrap">
                    {r.actorName ?? <span className="text-subtle">—</span>}
                  </TD>
                  <TD className="whitespace-nowrap">
                    {auditLabel(r.action)}
                    {r.eventDate && (
                      <span className="ml-1 text-xs text-muted">
                        · mix {r.eventDate.split("-").reverse().join("/")}
                      </span>
                    )}
                  </TD>
                  <TD>
                    {isSuccess(r.outcome) ? (
                      <Badge variant="win">Sucesso</Badge>
                    ) : (
                      <Badge variant="loss">{outcomeLabel(r.outcome)}</Badge>
                    )}
                  </TD>
                  <TD className="text-xs text-muted">{describe(r.detail, names)}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </div>
      ) : (
        <EmptyState icon={ScrollText} title="Nenhum registro encontrado" className="py-10" />
      )}
      <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm">
        <span className="text-muted">Página {page}</span>
        <div className="flex gap-2">
          {page > 1 && (
            <Button variant="secondary" size="sm" asChild>
              <Link href={href(page - 1)}>Anterior</Link>
            </Button>
          )}
          {hasMore && (
            <Button variant="secondary" size="sm" asChild>
              <Link href={href(page + 1)}>Próxima</Link>
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
