"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { setFeature } from "@/app/(app)/admin/actions";
import { Switch } from "../ui/switch";

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
    description:
      "Quando ativada, sugere times automaticamente quando 10 jogadores são classificados. Os jogadores votam se concordam ou não com a divisão.",
    available: false,
  },
];

export function FeatureToggles({ values }: { values: Record<string, boolean> }) {
  const [pending, start] = useTransition();
  return (
    <ul className="divide-y divide-border">
      {FEATURES.map((f) => (
        <li key={f.key} className="flex items-center justify-between gap-4 px-4 py-3">
          <div className="min-w-0">
            <div className="font-medium">{f.name}</div>
            <div className="text-sm text-muted">{f.description}</div>
          </div>
          {f.available ? (
            <Switch
              label={f.name}
              checked={!!values[f.key]}
              pending={pending}
              onChange={(next) =>
                start(async () => {
                  const r = await setFeature(f.key, next);
                  if (r.ok) toast.success(r.message);
                  else toast.error(r.message);
                })
              }
            />
          ) : (
            <span className="shrink-0 text-xs text-subtle">Em breve</span>
          )}
        </li>
      ))}
    </ul>
  );
}
