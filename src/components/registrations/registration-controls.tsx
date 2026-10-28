"use client";

import { Loader2, Play, RotateCcw, Search, Trash2, UserPlus } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { startDraft } from "@/app/(app)/draft/actions";
import {
  addPlayerToMix,
  removeRegistration,
  resetRegistrations,
  type ActionResult,
} from "@/app/(app)/inscricoes/actions";
import { Avatar } from "../ui/avatar";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogTrigger } from "../ui/dialog";
import { Input } from "../ui/input";

function useAction() {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionResult>) =>
    start(async () => {
      const r = await fn();
      if (r.ok) toast.success(r.message);
      else toast.error(r.message);
    });
  return [pending, run] as const;
}

export function ResetButton({ scheduleId, date }: { scheduleId: string; date: string }) {
  const [pending, run] = useAction();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-loss hover:text-loss"
      disabled={pending}
      onClick={() => {
        if (confirm("Remover TODAS as inscrições deste mix?")) run(() => resetRegistrations(scheduleId, date));
      }}
    >
      {pending ? <Loader2 className="animate-spin" /> : <RotateCcw />} Reiniciar
    </Button>
  );
}

export function RemoveButton({ registrationId, name }: { registrationId: string; name: string }) {
  const [pending, run] = useAction();
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-8 text-muted hover:text-loss"
      disabled={pending}
      aria-label={`Remover ${name}`}
      onClick={() => {
        if (confirm(`Remover ${name} da lista?`)) run(() => removeRegistration(registrationId));
      }}
    >
      {pending ? <Loader2 className="animate-spin" /> : <Trash2 />}
    </Button>
  );
}

export function StartDraftButton({ scheduleId, date }: { scheduleId: string; date: string }) {
  const [pending, run] = useAction();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => {
        if (confirm("Iniciar a seleção de equipes agora? Os votos de capitão serão encerrados."))
          run(() => startDraft(scheduleId, date));
      }}
    >
      {pending ? <Loader2 className="animate-spin" /> : <Play />} Iniciar seleção
    </Button>
  );
}

/** Super admin: inclui um jogador cadastrado escolhendo na lista. */
export function AddPlayerButton({
  scheduleId,
  date,
  players,
}: {
  scheduleId: string;
  date: string;
  players: { id: string; name: string; avatarUrl: string | null }[];
}) {
  const [pending, start] = useTransition();
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const q = query.trim().toLowerCase();
  const shown = q ? players.filter((p) => p.name.toLowerCase().includes(q)) : players;
  const add = (p: (typeof players)[number]) => {
    if (!confirm(`Incluir ${p.name} na lista do mix?`)) return;
    setBusy(p.id);
    start(async () => {
      const r = await addPlayerToMix(scheduleId, date, p.id);
      if (r.ok) toast.success(r.message);
      else toast.error(r.message);
      setBusy(null);
    });
  };
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <UserPlus /> Incluir jogador
        </Button>
      </DialogTrigger>
      <DialogContent title="Incluir jogador" description="Entra no fim da lista, como uma inscrição normal.">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar jogador"
            aria-label="Buscar jogador"
            className="pl-8"
          />
        </div>
        <ul className="mt-3 max-h-80 space-y-0.5 overflow-y-auto">
          {shown.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                disabled={pending}
                onClick={() => add(p)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-2 disabled:opacity-60"
              >
                <Avatar name={p.name} src={p.avatarUrl} size="xs" />
                <span className="flex-1 truncate font-medium">{p.name}</span>
                {busy === p.id ? (
                  <Loader2 className="size-4 animate-spin text-muted" />
                ) : (
                  <UserPlus className="size-4 text-muted" />
                )}
              </button>
            </li>
          ))}
          {!shown.length && <li className="px-2 py-4 text-center text-sm text-muted">Nenhum jogador encontrado.</li>}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
