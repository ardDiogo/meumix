"use client";

import { AlertCircle, Loader2, ShieldAlert, X } from "lucide-react";
import { useActionState, useEffect, useTransition } from "react";
import { toast } from "sonner";
import { createPenalty, deactivatePenalty, type PenaltyState } from "@/app/(app)/admin/actions";
import { formatDate } from "@/lib/format";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader } from "../ui/card";
import { EmptyState } from "../ui/empty-state";
import { Input, Label, Select } from "../ui/input";
import { Table, TD, TH, THead, TR } from "../ui/table";

export interface PenaltyRow {
  id: string;
  userName: string;
  delaySeconds: number;
  reason: string;
  expiresAt: string | null;
  createdAt: string;
}

export interface PenaltyHistoryRow extends PenaltyRow {
  isActive: boolean;
  appliedBy: string;
}

const DELAYS = [30, 60, 120, 300, 600, 900, 1800, 3600];
const delayLabel = (s: number) => (s < 60 ? `${s}s` : s < 3600 ? `${s / 60} min` : "1 hora");

export function PenaltiesPanel({
  users,
  penalties,
  history,
}: {
  users: { id: string; name: string }[];
  penalties: PenaltyRow[];
  history: PenaltyHistoryRow[];
}) {
  const [state, action, pending] = useActionState<PenaltyState, FormData>(createPenalty, { status: "idle" });
  const [removing, start] = useTransition();
  useEffect(() => {
    if (state.status === "saved") toast.success(state.message);
  }, [state]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[1fr_24rem]">
        <Card>
          <CardHeader
            title="Punições ativas"
            description="Atrasam a liberação da inscrição do jogador. As vencidas são desativadas automaticamente."
          />
          {penalties.length ? (
            <ul className="divide-y divide-border">
              {penalties.map((p) => (
                <li key={p.id} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-medium">
                      <ShieldAlert className="size-4 animate-pulse text-loss" aria-hidden /> {p.userName}
                      <span className="text-xs font-semibold text-loss">+{delayLabel(p.delaySeconds)}</span>
                    </div>
                    <div className="text-sm text-muted">{p.reason}</div>
                    <div className="text-xs text-subtle">
                      Desde {formatDate(p.createdAt)} · {p.expiresAt ? `até ${formatDate(p.expiresAt)}` : "permanente"}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={removing}
                    onClick={() =>
                      confirm(`Remover a punição de ${p.userName}?`) &&
                      start(async () => {
                        const r = await deactivatePenalty(p.id);
                        if (r.ok) toast.success(r.message);
                        else toast.error(r.message);
                      })
                    }
                  >
                    <X /> Remover
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={ShieldAlert} title="Nenhuma punição ativa" className="py-8" />
          )}
        </Card>

        <Card className="self-start">
          <CardHeader title="Aplicar punição" description="Somente o master pode aplicar punições." />
          <CardContent>
            <form action={action} className="space-y-3">
              <div>
                <Label htmlFor="userId">Jogador</Label>
                <Select id="userId" name="userId" required defaultValue="">
                  <option value="" disabled>
                    Selecione…
                  </option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="delaySeconds">Atraso na abertura</Label>
                <Select id="delaySeconds" name="delaySeconds" defaultValue="60">
                  {DELAYS.map((d) => (
                    <option key={d} value={d}>
                      {delayLabel(d)}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="reason">Motivo</Label>
                <Input id="reason" name="reason" placeholder="Ex.: saiu no meio do mix" maxLength={140} required />
              </div>
              <div>
                <Label htmlFor="expiresAt">Expira em (vazio = permanente)</Label>
                <Input id="expiresAt" name="expiresAt" type="date" />
              </div>
              {state.status === "error" && (
                <p role="alert" className="flex items-center gap-1 text-sm text-loss">
                  <AlertCircle className="size-4" /> {state.message}
                </p>
              )}
              <Button type="submit" variant="primary" className="w-full" disabled={pending}>
                {pending && <Loader2 className="animate-spin" />} Aplicar punição
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader title={`Histórico (${history.length})`} />
        {history.length ? (
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <TR>
                  <TH>Jogador</TH>
                  <TH>Delay</TH>
                  <TH>Expirou</TH>
                  <TH>Motivo</TH>
                  <TH>Aplicado por</TH>
                </TR>
              </THead>
              <tbody>
                {history.map((h) => (
                  <TR key={h.id}>
                    <TD className="font-medium">{h.userName}</TD>
                    <TD className="tabular">{delayLabel(h.delaySeconds)}</TD>
                    <TD className="text-muted">
                      {h.isActive
                        ? h.expiresAt
                          ? `Ativa até ${formatDate(h.expiresAt)}`
                          : "Permanente"
                        : h.expiresAt && new Date(h.expiresAt) < new Date()
                          ? `Sim (${formatDate(h.expiresAt)})`
                          : "Removida"}
                    </TD>
                    <TD className="text-muted">{h.reason}</TD>
                    <TD className="text-muted">{h.appliedBy}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </div>
        ) : (
          <EmptyState icon={ShieldAlert} title="Nenhuma punição aplicada ainda" className="py-8" />
        )}
      </Card>
    </div>
  );
}
