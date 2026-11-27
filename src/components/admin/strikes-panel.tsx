"use client";

import { Loader2, ShieldAlert, Undo2 } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { endSuspension, pardonStrike } from "@/app/(app)/admin/actions";
import { formatDate } from "@/lib/format";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardHeader } from "../ui/card";

export interface SuspensionItem {
  id: number;
  userName: string;
  league: string;
  left: number;
  since: string;
}

export interface StrikeItem {
  id: number;
  userName: string;
  league: string;
  date: string;
  kind: "late_leave" | "no_show";
  points: number;
  expiresAt: string;
  pardoned: boolean;
  suspended: boolean;
}

const brDate = (date: string) => date.split("-").reverse().join("/");

export function StrikesPanel({ suspensions, strikes }: { suspensions: SuspensionItem[]; strikes: StrikeItem[] }) {
  const [pending, start] = useTransition();
  const run = (question: string, fn: () => Promise<{ ok: boolean; message: string }>) =>
    confirm(question) &&
    start(async () => {
      const r = await fn();
      if (r.ok) toast.success(r.message);
      else toast.error(r.message);
    });

  return (
    <Card>
      <CardHeader
        title="Faltas e suspensões"
        description="Sair do mix sendo classificado a menos de 3h = 1 falta; não comparecer = 2 faltas. Com 2 faltas em 60 dias na mesma liga, o jogador entra só como reserva nos próximos 2 mixes dela."
      />
      {suspensions.length || strikes.length ? (
        <ul className="divide-y divide-border">
          {suspensions.map((s) => (
            <li key={`s${s.id}`} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 font-medium">
                  <ShieldAlert className="size-4 text-loss" aria-hidden /> {s.userName}
                  <Badge variant="loss">Suspenso</Badge>
                </div>
                <div className="text-xs text-muted">
                  {s.league} · só reserva por mais {s.left} {s.left === 1 ? "mix" : "mixes"} · desde{" "}
                  {formatDate(s.since)}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => run(`Encerrar a suspensão de ${s.userName}?`, () => endSuspension(s.id))}
              >
                {pending ? <Loader2 className="animate-spin" /> : <Undo2 />} Encerrar
              </Button>
            </li>
          ))}
          {strikes.map((s) => (
            <li key={`f${s.id}`} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 font-medium">
                  {s.userName}
                  <Badge variant={s.pardoned ? "neutral" : "loss"}>
                    {s.points} {s.points === 1 ? "falta" : "faltas"}
                  </Badge>
                  {s.pardoned && <Badge variant="neutral">Perdoada</Badge>}
                  {s.suspended && <Badge variant="neutral">Virou suspensão</Badge>}
                </div>
                <div className="text-xs text-muted">
                  {s.league} · mix de {brDate(s.date)} ·{" "}
                  {s.kind === "no_show" ? "não compareceu" : "saiu a menos de 3h"} · vale até {formatDate(s.expiresAt)}
                </div>
              </div>
              {!s.pardoned && !s.suspended && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => run(`Perdoar a falta de ${s.userName}?`, () => pardonStrike(s.id))}
                >
                  {pending ? <Loader2 className="animate-spin" /> : <Undo2 />} Perdoar
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-4 py-3 text-sm text-muted">Nenhuma falta nos últimos 60 dias.</p>
      )}
    </Card>
  );
}
