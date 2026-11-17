"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { setFeature } from "@/app/(app)/admin/actions";
import { Badge } from "../ui/badge";
import { Card, CardHeader } from "../ui/card";
import { Switch } from "../ui/switch";

type Rule = {
  key: "strike_late_leave" | "strike_no_show" | null;
  name: string;
  mode: "Automática" | "Manual";
  description: string;
};

const RULES: Rule[] = [
  {
    key: "strike_late_leave",
    name: "Saída tardia — 1 falta",
    mode: "Automática",
    description: "Classificado que cancela a inscrição faltando menos de 3h para o mix. Reserva não leva falta.",
  },
  {
    key: "strike_no_show",
    name: "Não compareceu — 2 faltas",
    mode: "Manual",
    description: 'O admin remove o jogador da lista com "Não compareceu". Desligada, a lixeira só remove, sem falta.',
  },
  {
    key: null,
    name: "Suspensão — 2 mixes só como reserva",
    mode: "Automática",
    description:
      "Com 2 faltas em 60 dias na mesma liga. Pode se inscrever, mas fica atrás de todos. Ao terminar, as faltas zeram. Vale enquanto alguma regra de falta estiver ligada.",
  },
  {
    key: null,
    name: "Atraso na inscrição",
    mode: "Manual",
    description: "Aplicada pelo master no formulário abaixo: atrasa a liberação da inscrição do jogador.",
  },
];

export function PunishmentRules({
  values,
  counts,
}: {
  values: { strike_late_leave: boolean; strike_no_show: boolean };
  counts: { strikes: number; suspensions: number };
}) {
  const [pending, start] = useTransition();
  return (
    <Card>
      <CardHeader
        title="Regras de punição"
        description={`Faltas valendo agora: ${counts.strikes} · suspensos agora: ${counts.suspensions}. Perdoar falta e encerrar suspensão: Admin → Jogadores.`}
      />
      <ul className="divide-y divide-border">
        {RULES.map((r) => (
          <li key={r.name} className="flex items-center justify-between gap-4 px-4 py-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 font-medium">
                {r.name}
                <Badge variant={r.mode === "Automática" ? "brand" : "neutral"}>{r.mode}</Badge>
              </div>
              <div className="text-sm text-muted">{r.description}</div>
            </div>
            {r.key ? (
              <Switch
                label={r.name}
                checked={values[r.key]}
                pending={pending}
                onChange={(next) =>
                  start(async () => {
                    const res = await setFeature(r.key!, next);
                    if (res.ok) toast.success(next ? "Regra ligada." : "Regra desligada.");
                    else toast.error(res.message);
                  })
                }
              />
            ) : (
              <span className="shrink-0 text-xs text-subtle">Sempre ativa</span>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
