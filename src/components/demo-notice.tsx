import { FlaskConical } from "lucide-react";
import type { DataSourceKind } from "@/types/views";
import { Badge } from "./ui/badge";

/** Selo exibido em blocos que mostram dados demonstrativos. */
export function DemoBadge({ kind = "demo" }: { kind?: DataSourceKind }) {
  if (kind !== "demo") return null;
  return (
    <Badge variant="demo" title="Dados fictícios gerados para demonstração">
      <FlaskConical aria-hidden /> Demo
    </Badge>
  );
}

/** Faixa global indicando que a aplicação está exibindo dados fictícios. */
export function DemoBanner({ kind }: { kind: DataSourceKind }) {
  if (kind !== "demo") return null;
  return (
    <div
      role="note"
      className="flex items-center gap-2 border-b border-border bg-surface-2/60 px-4 py-1.5 text-xs text-muted lg:px-6"
    >
      <FlaskConical className="size-3.5 shrink-0 text-brand" aria-hidden />
      <span>
        <strong className="font-semibold text-fg">Modo demonstração.</strong> Jogadores, partidas e estatísticas são
        fictícios e servem apenas para visualizar a plataforma.
      </span>
    </div>
  );
}
