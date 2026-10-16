"use client";

import { ArrowDown, ArrowUp, GripVertical, Loader2, Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { addMap, deleteMap, reorderMaps, setMapActive } from "@/app/(app)/admin/config-actions";
import type { ManagedMap } from "@/services/maps";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Switch } from "../ui/switch";

export function MapsManager({ maps }: { maps: ManagedMap[] }) {
  const [list, setList] = useState(maps);
  const [name, setName] = useState("");
  const [short, setShort] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // Atualiza a lista quando o servidor manda dados novos (ex.: após adicionar).
  const [prev, setPrev] = useState(maps);
  if (prev !== maps) {
    setPrev(maps);
    setList(maps);
  }

  const run = (key: string, fn: () => Promise<{ ok: boolean; message: string }>, onFail?: () => void) => {
    setBusy(key);
    start(async () => {
      const r = await fn();
      setBusy(null);
      if (r.ok) toast.success(r.message);
      else {
        toast.error(r.message);
        onFail?.();
      }
    });
  };

  const commitOrder = (next: ManagedMap[]) => {
    const before = list;
    setList(next);
    run(
      "order",
      () => reorderMaps(next.map((m) => m.id)),
      () => setList(before),
    );
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= list.length) return;
    const next = [...list];
    [next[index], next[target]] = [next[target]!, next[index]!];
    commitOrder(next);
  };

  const active = list.filter((m) => m.active).length;

  return (
    <div className="space-y-4 px-4 pb-4">
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          run("add", async () => {
            const r = await addMap(name, short);
            if (r.ok) {
              setName("");
              setShort("");
            }
            return r;
          });
        }}
      >
        <Input
          aria-label="Nome do mapa"
          placeholder="Nome do mapa (ex: Dust2)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={30}
          className="flex-1"
        />
        <Input
          aria-label="Sigla"
          placeholder="Sigla (ex: D2)"
          value={short}
          onChange={(e) => setShort(e.target.value)}
          maxLength={8}
          className="sm:w-32"
        />
        <Button type="submit" variant="primary" disabled={pending || name.trim().length < 2}>
          {busy === "add" ? <Loader2 className="animate-spin" /> : <Plus />} Adicionar
        </Button>
      </form>

      <ul className="space-y-2">
        {list.map((m, i) => (
          <li
            key={m.id}
            draggable
            onDragStart={() => setDragId(m.id)}
            onDragEnd={() => setDragId(null)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (!dragId || dragId === m.id) return;
              const next = list.filter((x) => x.id !== dragId);
              next.splice(
                i,
                0,
                list.find((x) => x.id === dragId)!,
              );
              setDragId(null);
              commitOrder(next);
            }}
            className={cn(
              "flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors",
              m.active ? "border-border bg-surface-2" : "border-border/60 bg-surface",
              dragId === m.id && "opacity-50",
            )}
          >
            <GripVertical className="size-4 shrink-0 cursor-grab text-subtle" aria-hidden />
            <div className={cn("min-w-0 flex-1", !m.active && "text-muted")}>
              <span className="font-semibold">{m.name}</span>
              {m.shortName && <span className="ml-1.5 text-sm text-muted">({m.shortName})</span>}
            </div>
            <div className="flex items-center">
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Subir ${m.name}`}
                disabled={pending || i === 0}
                onClick={() => move(i, -1)}
                className="px-1.5"
              >
                <ArrowUp />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Descer ${m.name}`}
                disabled={pending || i === list.length - 1}
                onClick={() => move(i, 1)}
                className="px-1.5"
              >
                <ArrowDown />
              </Button>
            </div>
            <span className={cn("hidden w-12 text-right text-sm font-medium sm:block", !m.active && "text-muted")}>
              {m.active ? "Ativo" : "Inativo"}
            </span>
            <Switch
              label={`${m.name} ativo`}
              checked={m.active}
              pending={busy === `toggle-${m.id}`}
              disabled={pending}
              onChange={(next) => {
                setList((l) => l.map((x) => (x.id === m.id ? { ...x, active: next } : x)));
                run(
                  `toggle-${m.id}`,
                  () => setMapActive(m.id, next),
                  () => setList((l) => l.map((x) => (x.id === m.id ? { ...x, active: !next } : x))),
                );
              }}
            />
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Excluir ${m.name}`}
              disabled={pending}
              className="px-1.5 text-loss hover:text-loss"
              onClick={() => confirm(`Excluir o mapa ${m.name}?`) && run(`del-${m.id}`, () => deleteMap(m.id))}
            >
              {busy === `del-${m.id}` ? <Loader2 className="animate-spin" /> : <Trash2 />}
            </Button>
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted">
        <span className="font-semibold text-fg">{active}</span> mapas ativos de {list.length} cadastrados
      </p>
    </div>
  );
}
