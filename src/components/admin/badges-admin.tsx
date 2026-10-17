"use client";

import { Loader2, Plus, Search, Trash2, X } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { createBadge, deleteBadge, grantBadge, revokeBadge } from "@/app/(app)/admin/badge-actions";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Badge, PlayerBadge } from "@/services/badges";
import { BADGE_COLORS, BADGE_ICONS, BadgeIcon } from "../badges/badge-icon";
import { BADGE_IMAGES } from "@/lib/badge-images";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader } from "../ui/card";
import { EmptyState } from "../ui/empty-state";
import { Input, Label, Select, Textarea } from "../ui/input";

function useRun() {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; message: string }>, onOk?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(r.message);
        onOk?.();
      } else toast.error(r.message);
    });
  return [pending, run] as const;
}

export function BadgesAdmin({
  badges,
  granted,
  players,
}: {
  badges: Badge[];
  granted: PlayerBadge[];
  players: { id: string; name: string }[];
}) {
  const names = new Map(players.map((p) => [p.id, p.name]));
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[24rem_1fr]">
        <CreateBadge />
        <Card className="self-start">
          <CardHeader title="Insígnias" description="Clique na lixeira para excluir (remove também dos jogadores)." />
          {badges.length ? (
            <ul className="divide-y divide-border">
              {badges.map((b) => (
                <BadgeRow key={b.id} badge={b} />
              ))}
            </ul>
          ) : (
            <EmptyState icon={Plus} title="Nenhuma insígnia criada ainda" className="py-8" />
          )}
        </Card>
      </div>
      {badges.length > 0 && <GrantBadge badges={badges} players={players} />}
      <Card>
        <CardHeader title={`Concedidas (${granted.length})`} />
        {granted.length ? (
          <ul className="divide-y divide-border">
            {granted.map((g) => (
              <GrantedRow key={g.id} item={g} player={names.get(g.userId) ?? "Jogador"} />
            ))}
          </ul>
        ) : (
          <EmptyState icon={Plus} title="Nenhuma insígnia concedida ainda" className="py-8" />
        )}
      </Card>
    </div>
  );
}

function CreateBadge() {
  const [pending, run] = useRun();
  const [form, setForm] = useState({
    name: "",
    description: "",
    unlock: "",
    icon: "trophy",
    color: BADGE_COLORS[0]!,
  });
  return (
    <Card className="self-start">
      <CardHeader title="Criar insígnia" description="Escolha nome, ícone e cor." />
      <CardContent className="space-y-3">
        <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-2/50 p-3">
          <BadgeIcon icon={form.icon} color={form.color} size="md" />
          <div className="min-w-0">
            <div className="truncate font-semibold">{form.name || "Nome da insígnia"}</div>
            <div className="truncate text-xs text-muted">{form.description || "Descrição"}</div>
          </div>
        </div>
        <div>
          <Label htmlFor="badge-name">Nome</Label>
          <Input
            id="badge-name"
            maxLength={40}
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Ex.: Rei do clutch"
          />
        </div>
        <div>
          <Label htmlFor="badge-desc">Descrição</Label>
          <Textarea
            id="badge-desc"
            rows={2}
            maxLength={200}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Ex.: Venceu 3 clutches 1v3 no mesmo mix"
          />
        </div>
        <div>
          <Label htmlFor="badge-unlock">Como desbloquear (opcional)</Label>
          <Input
            id="badge-unlock"
            maxLength={200}
            value={form.unlock}
            onChange={(e) => setForm((f) => ({ ...f, unlock: e.target.value }))}
            placeholder="Ex.: Participar de 50 mixes completos"
          />
        </div>
        <div>
          <Label>Ícone</Label>
          <div className="grid grid-cols-7 gap-1.5">
            {Object.entries(BADGE_ICONS).map(([key, { icon: Icon, label }]) => (
              <button
                key={key}
                type="button"
                title={label}
                aria-label={label}
                aria-pressed={form.icon === key}
                onClick={() => setForm((f) => ({ ...f, icon: key }))}
                className={cn(
                  "flex h-9 items-center justify-center rounded-md border transition-colors",
                  form.icon === key ? "border-brand bg-brand/10 text-brand" : "border-border text-muted hover:text-fg",
                )}
              >
                <Icon className="size-4" />
              </button>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-7 gap-1.5">
            {Object.entries(BADGE_IMAGES).map(([key, { label, src }]) => (
              <button
                key={key}
                type="button"
                title={label}
                aria-label={label}
                aria-pressed={form.icon === key}
                onClick={() => setForm((f) => ({ ...f, icon: key }))}
                className={cn(
                  "flex h-11 items-center justify-center rounded-md border p-1 transition-colors",
                  form.icon === key ? "border-brand bg-brand/10" : "border-border hover:border-border-strong",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="size-8 object-contain" />
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label>Cor</Label>
          <div className="flex flex-wrap gap-2">
            {BADGE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Cor ${c}`}
                aria-pressed={form.color === c}
                onClick={() => setForm((f) => ({ ...f, color: c }))}
                className={cn("size-7 rounded-full border-2", form.color === c ? "border-fg" : "border-transparent")}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
        <Button
          variant="primary"
          className="w-full"
          disabled={pending || form.name.trim().length < 2}
          onClick={() =>
            run(
              () => createBadge(form),
              () => setForm((f) => ({ ...f, name: "", description: "", unlock: "" })),
            )
          }
        >
          {pending ? <Loader2 className="animate-spin" /> : <Plus />} Criar insígnia
        </Button>
      </CardContent>
    </Card>
  );
}

function BadgeRow({ badge }: { badge: Badge }) {
  const [pending, run] = useRun();
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <BadgeIcon icon={badge.icon} color={badge.color} size="md" />
      <div className="min-w-0 flex-1">
        <div className="font-medium">{badge.name}</div>
        {badge.description && <div className="truncate text-xs text-muted">{badge.description}</div>}
        {badge.unlock && (
          <div className="text-xs text-subtle">
            <span className="font-medium text-muted">Desbloqueio:</span> {badge.unlock}
          </div>
        )}
      </div>
      <span className="text-xs text-muted tabular">
        {badge.holders} {badge.holders === 1 ? "jogador" : "jogadores"}
      </span>
      <Button
        variant="ghost"
        size="sm"
        aria-label={`Excluir ${badge.name}`}
        disabled={pending}
        className="px-1.5 text-loss hover:text-loss"
        onClick={() => confirm(`Excluir a insígnia "${badge.name}"?`) && run(() => deleteBadge(badge.id))}
      >
        {pending ? <Loader2 className="animate-spin" /> : <Trash2 />}
      </Button>
    </li>
  );
}

function GrantBadge({ badges, players }: { badges: Badge[]; players: { id: string; name: string }[] }) {
  const [pending, run] = useRun();
  const [badgeId, setBadgeId] = useState(badges[0]!.id);
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [query, setQuery] = useState("");
  const shown = useMemo(
    () => players.filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase())),
    [players, query],
  );
  return (
    <Card>
      <CardHeader title="Conceder insígnia" description="Escolha a insígnia e um ou mais jogadores." />
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="grant-badge">Insígnia</Label>
            <Select id="grant-badge" value={badgeId} onChange={(e) => setBadgeId(e.target.value)}>
              {badges.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="grant-note">Observação (opcional)</Label>
            <Input
              id="grant-note"
              maxLength={140}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ex.: Mix de 16/10"
            />
          </div>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
          <Input
            aria-label="Filtrar jogadores"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filtrar jogadores…"
            className="pl-9"
          />
        </div>
        <ul className="grid max-h-64 gap-1.5 overflow-y-auto sm:grid-cols-3 lg:grid-cols-4">
          {shown.map((p) => {
            const on = selected.includes(p.id);
            return (
              <li key={p.id}>
                <label
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm",
                    on ? "border-brand bg-brand/10" : "border-border bg-surface-2",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => setSelected((l) => (on ? l.filter((x) => x !== p.id) : [...l, p.id]))}
                    className="size-4 accent-brand"
                  />
                  <span className="truncate">{p.name}</span>
                </label>
              </li>
            );
          })}
        </ul>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-muted">{selected.length} selecionado(s)</span>
          <Button
            variant="primary"
            disabled={pending || !selected.length}
            onClick={() =>
              run(
                () => grantBadge(badgeId, selected, note),
                () => {
                  setSelected([]);
                  setNote("");
                },
              )
            }
          >
            {pending ? <Loader2 className="animate-spin" /> : <Plus />} Conceder
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function GrantedRow({ item, player }: { item: PlayerBadge; player: string }) {
  const [pending, run] = useRun();
  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <BadgeIcon icon={item.icon} color={item.color} size="xs" />
      <div className="min-w-0 flex-1 text-sm">
        <span className="font-medium">{player}</span> <span className="text-muted">recebeu</span>{" "}
        <span className="font-medium">{item.name}</span>
        {item.note && <span className="text-muted"> · {item.note}</span>}
      </div>
      <span className="hidden text-xs text-subtle sm:block">{formatDate(item.createdAt)}</span>
      <Button
        variant="ghost"
        size="sm"
        aria-label="Remover insígnia do jogador"
        disabled={pending}
        className="px-1.5"
        onClick={() => confirm(`Remover "${item.name}" de ${player}?`) && run(() => revokeBadge(item.id))}
      >
        {pending ? <Loader2 className="animate-spin" /> : <X />}
      </Button>
    </li>
  );
}
