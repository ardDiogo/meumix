"use client";

import { Loader2 } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { setFeature } from "@/app/(app)/admin/actions";
import { cn } from "@/lib/utils";

const FEATURES = [
  {
    key: "map_tiebreaker" as const,
    name: "Desempate de mapas",
    description: "Abre rounds de votação quando o 4º mapa empata (com sorteio no fim).",
    available: true,
  },
  {
    key: "team_suggestion" as const,
    name: "Sugestão de times balanceados",
    description: "Depende de nível e ELO reais. Disponível em uma próxima etapa.",
    available: false,
  },
  {
    key: "background_music" as const,
    name: "Música de fundo",
    description: "Disponível em uma próxima etapa.",
    available: false,
  },
];

export function FeatureToggles({ values }: { values: Record<string, boolean> }) {
  const [pending, start] = useTransition();
  return (
    <ul className="divide-y divide-border">
      {FEATURES.map((f) => {
        const on = !!values[f.key];
        return (
          <li key={f.key} className="flex items-center justify-between gap-4 px-4 py-3">
            <div className="min-w-0">
              <div className="font-medium">{f.name}</div>
              <div className="text-sm text-muted">{f.description}</div>
            </div>
            {f.available ? (
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-label={f.name}
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await setFeature("map_tiebreaker", !on);
                    if (r.ok) toast.success(r.message);
                    else toast.error(r.message);
                  })
                }
                className={cn(
                  "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors",
                  on ? "border-brand bg-brand" : "border-border-strong bg-surface-3",
                )}
              >
                {pending ? (
                  <Loader2 className="mx-auto size-3.5 animate-spin" />
                ) : (
                  <span
                    className={cn(
                      "inline-block size-4 rounded-full bg-fg transition-transform",
                      on ? "translate-x-6" : "translate-x-1",
                    )}
                  />
                )}
              </button>
            ) : (
              <span className="shrink-0 text-xs text-subtle">Em breve</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
