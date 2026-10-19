"use client";

import { Loader2, Plus, Power, RefreshCw, Search, SlidersHorizontal, Trash2, X } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  createBadge,
  deleteBadge,
  grantBadge,
  recomputeBadgesNow,
  revokeBadge,
  setBadgeEnabled,
  setPlayerBadgeActive,
  updateBadgeParams,
} from "@/app/(app)/admin/badge-actions";
import { BADGE_RULES } from "@/lib/badge-engine";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Badge, PlayerBadge } from "@/services/badges";
import { BADGE_COLORS, BADGE_ICONS, BadgeIcon } from "../badges/badge-icon";
import { BADGE_IMAGES } from "@/lib/badge-images";
import { Button } from "../ui/button";
import { Badge as Tag } from "../ui/badge";
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
  const grantable = badges.filter((b) => b.enabled);
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[24rem_1fr]">
        <CreateBadge />
        <Card className="self-start">
          <CardHeader
            title="Insígnias"
            description="Automáticas são concedidas e removidas pelos resultados; manuais, pelo admin. Desabilitar esconde sem apagar o histórico."
            action={<RecomputeButton />}
          />
          {badges.length ? (
            <ul className="divide-y divide-border">
              {/* Automáticas primeiro. */}
              {[...badges]
                .sort((a, b) => Number(!!b.autoRule) - Number(!!a.autoRule))
                .map((b) => (
                  <BadgeRow key={b.id} badge={b} />
                ))}
            </ul>
          ) : (
            <EmptyState icon={Plus} title="Nenhuma insígnia criada ainda" className="py-8" />
          )}
        </Card>
      </div>
      {grantable.length > 0 && <GrantBadge badges={grantable} players={players} />}
      <Card>
        <CardHeader
          title={`Concedidas (${granted.length})`}
          description="Ativas agora e as desativadas pelo admin. Automáticas: Desativar trava para o jogador; Reativar devolve à regra."
        />
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

const PARAM_LABELS: Record<string, string> = {
  n: "Mapas seguidos",
  min_mixes: "Mínimo de mixes",
  positions: "Posições",
  window: "Janela (mixes)",
  mixes: "Mixes",
  min_rating: "Nota mínima",
  min_maps: "Mínimo de partidas no mapa",
  min_win_rate: "Vitórias mínimas (%)",
};

function RecomputeButton() {
  const [pending, run] = useRun();
  return (
    <Button variant="outline" size="sm" disabled={pending} onClick={() => run(() => recomputeBadgesNow())}>
      {pending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Recalcular
    </Button>
  );
}

function BadgeRow({ badge }: { badge: Badge }) {
  const [pending, run] = useRun();
  const [editing, setEditing] = useState(false);
  const [params, setParams] = useState(badge.params);
  return (
    <li className={cn("px-4 py-3", !badge.enabled && "opacity-60")}>
      <div className="flex items-center gap-3">
        <BadgeIcon icon={badge.icon} color={badge.color} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-medium">{badge.name}</span>
            <Tag variant={badge.kind === "dynamic" ? "brand" : "neutral"}>
              {badge.kind === "dynamic" ? "Dinâmica" : "Permanente"}
            </Tag>
            <Tag variant={badge.autoRule ? "win" : "neutral"}>{badge.autoRule ? "Automática" : "Manual"}</Tag>
            {!badge.enabled && <Tag variant="loss">Desabilitada</Tag>}
          </div>
          {badge.description && <div className="truncate text-xs text-muted">{badge.description}</div>}
          {badge.unlock && (
            <div className="text-xs text-subtle">
              <span className="font-medium text-muted">Desbloqueio:</span> {badge.unlock}
            </div>
          )}
          {badge.deactivation && (
            <div className="text-xs text-subtle">
              <span className="font-medium text-muted">Desativação:</span> {badge.deactivation}
            </div>
          )}
        </div>
        <span className="text-right text-xs text-muted tabular">
          {badge.holders} {badge.holders === 1 ? "ativo" : "ativos"}
          <br />
          <span className="text-subtle">
            {badge.conquests} {badge.conquests === 1 ? "conquista" : "conquistas"}
          </span>
        </span>
        {badge.autoRule && Object.keys(badge.params).length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Regra de ${badge.name}`}
            className="px-1.5"
            onClick={() => setEditing((e) => !e)}
          >
            <SlidersHorizontal />
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          aria-label={badge.enabled ? `Desabilitar ${badge.name}` : `Habilitar ${badge.name}`}
          title={badge.enabled ? "Desabilitar (mantém o histórico)" : "Habilitar"}
          disabled={pending}
          className={cn("px-2 text-xs", badge.enabled ? "text-win hover:text-win" : "text-subtle")}
          onClick={() => run(() => setBadgeEnabled(badge.id, !badge.enabled))}
        >
          <Power /> {badge.enabled ? "Ativa" : "Desativada"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Excluir ${badge.name}`}
          disabled={pending}
          className="px-1.5 text-loss hover:text-loss"
          onClick={() =>
            confirm(
              `Excluir a insígnia "${badge.name}"? Isso apaga também o histórico. Para só esconder, desabilite.`,
            ) && run(() => deleteBadge(badge.id))
          }
        >
          {pending ? <Loader2 className="animate-spin" /> : <Trash2 />}
        </Button>
      </div>
      {editing && badge.autoRule && (
        <div className="mt-3 rounded-md border border-border bg-surface-2/50 p-3">
          <div className="mb-2 text-xs text-muted">Regra: {BADGE_RULES[badge.autoRule].label}</div>
          <div className="grid gap-2 sm:grid-cols-3">
            {Object.entries(params).map(([key, value]) => (
              <div key={key}>
                <Label htmlFor={`p-${badge.id}-${key}`}>{PARAM_LABELS[key] ?? key}</Label>
                <Input
                  id={`p-${badge.id}-${key}`}
                  type="number"
                  step={key === "min_rating" ? "0.05" : "1"}
                  min={key === "min_rating" ? "0.1" : "1"}
                  value={value}
                  onChange={(e) => setParams((p) => ({ ...p, [key]: Number(e.target.value) }))}
                />
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-end">
            <Button
              variant="primary"
              size="sm"
              disabled={pending}
              onClick={() =>
                run(
                  () => updateBadgeParams(badge.id, params),
                  () => setEditing(false),
                )
              }
            >
              {pending && <Loader2 className="animate-spin" />} Salvar e recalcular
            </Button>
          </div>
        </div>
      )}
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
                  {b.autoRule ? " (automática — concedida à mão)" : ""}
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
  const off = !!item.deactivatedAt;
  return (
    <li className={cn("flex items-center gap-3 px-4 py-2.5", off && "opacity-60")}>
      <BadgeIcon icon={item.icon} color={item.color} size="xs" />
      <div className="min-w-0 flex-1 text-sm">
        <span className="font-medium">{player}</span> <span className="text-muted">{off ? "tinha" : "recebeu"}</span>{" "}
        <span className="font-medium">{item.name}</span>
        {item.note && <span className="text-muted"> · {item.note}</span>}
        {item.auto && item.reason && <span className="text-muted"> · {item.reason}</span>}
        {off && <span className="text-loss"> · desativada pelo admin</span>}
      </div>
      <span className="hidden text-xs text-subtle sm:block">{formatDate(item.createdAt)}</span>
      <Tag variant={item.auto ? "win" : "neutral"} className="hidden shrink-0 sm:inline-flex">
        {item.auto ? "Automática" : "Manual"}
      </Tag>
      {item.auto ? (
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          className={cn("px-2 text-xs", off ? "text-win hover:text-win" : "text-loss hover:text-loss")}
          title={off ? "Reativar (volta a seguir a regra automática)" : "Desativar para este jogador"}
          onClick={() => run(() => setPlayerBadgeActive(item.id, off))}
        >
          {pending ? <Loader2 className="animate-spin" /> : <Power />} {off ? "Reativar" : "Desativar"}
        </Button>
      ) : (
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
      )}
    </li>
  );
}
