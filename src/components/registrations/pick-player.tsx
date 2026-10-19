"use client";

import { Loader2, TrendingDown, TrendingUp } from "lucide-react";
import { formatDate } from "@/lib/format";
import type { PickBadge, PickInfo } from "@/lib/pick-types";
import { cn } from "@/lib/utils";
import { BadgeIcon } from "../badges/badge-icon";
import { MapIcon } from "../maps/map-icon";
import { Avatar } from "../ui/avatar";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogTrigger } from "../ui/dialog";

/** Quantas insígnias aparecem direto na lista do PICK (as demais ficam nos detalhes). */
export const PICK_BADGES_SHOWN = 3;

const RESULT = { win: "bg-win", loss: "bg-loss", draw: "bg-draw" } as const;

function BadgeChip({ badge }: { badge: PickBadge }) {
  return (
    <span
      title={[badge.name, badge.reason ?? badge.description].filter(Boolean).join(" — ")}
      className="inline-flex max-w-full items-center gap-1 rounded-full border py-0.5 pr-2 pl-0.5 text-[11px] font-semibold"
      style={{ borderColor: `${badge.color}55`, color: badge.color }}
    >
      <BadgeIcon icon={badge.icon} color={badge.color} size="xs" className="size-4 rounded-full" />
      <span className="truncate">{badge.name}</span>
    </span>
  );
}

function Trend({ value }: { value: number }) {
  if (!value) return null;
  const up = value > 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-[11px] tabular", up ? "text-win" : "text-loss")}>
      <Icon className="size-3" aria-hidden />
      {up ? "+" : ""}
      {value}
    </span>
  );
}

/**
 * Jogador disponível no PICK: resumo, até 3 insígnias e detalhes ao tocar.
 * As insígnias só informam o capitão: não mudam a ordem nem bloqueiam ninguém.
 */
export function PickPlayer({
  name,
  avatar,
  info,
  canPick,
  picking,
  disabled,
  onPick,
}: {
  name: string;
  avatar: string | null;
  info: PickInfo | undefined;
  canPick: boolean;
  picking: boolean;
  disabled: boolean;
  onPick: () => void;
}) {
  const shown = info?.badges.slice(0, PICK_BADGES_SHOWN) ?? [];
  const more = (info?.badges.length ?? 0) - shown.length;

  return (
    <Dialog>
      <div
        className={cn(
          "flex items-start gap-2.5 rounded-md border px-3 py-2.5 transition-colors",
          canPick ? "border-border bg-surface-2 hover:border-brand/60" : "border-border bg-surface-2/50",
        )}
      >
        <DialogTriggerArea name={name}>
          <Avatar name={name} src={avatar} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate font-medium text-fg">{name}</span>
              {info?.position && (
                <span className="rounded-sm bg-brand/12 px-1 text-[10px] font-bold text-brand tabular">
                  #{info.position}
                </span>
              )}
              {info && <Trend value={info.eloChange30d} />}
            </div>
            {info && (
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted tabular">
                <span>ELO {info.elo}</span>
                {info.mixes > 0 && <span>{Math.round(info.winRate)}% vit.</span>}
                {info.rating != null && <span>nota {info.rating.toFixed(2).replace(".", ",")}</span>}
                {info.recent.length > 0 && (
                  <span className="inline-flex gap-0.5" aria-label="Últimos mixes">
                    {info.recent.map((r, i) => (
                      <span key={i} className={cn("size-1.5 rounded-full", RESULT[r])} />
                    ))}
                  </span>
                )}
              </div>
            )}
            {shown.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {shown.map((b) => (
                  <BadgeChip key={b.id} badge={b} />
                ))}
                {more > 0 && (
                  <span className="inline-flex items-center rounded-full border border-border px-1.5 text-[11px] text-muted">
                    +{more}
                  </span>
                )}
              </div>
            )}
          </div>
        </DialogTriggerArea>
        {canPick && (
          <Button variant="primary" size="sm" disabled={disabled} onClick={onPick} className="shrink-0">
            {picking ? <Loader2 className="animate-spin" /> : "Escolher"}
          </Button>
        )}
      </div>

      <DialogContent title={name} description="Resumo para a escolha — as insígnias são só informação.">
        <PlayerDetails name={name} avatar={avatar} info={info} />
        {canPick && (
          <Button variant="primary" className="mt-4 w-full" disabled={disabled} onClick={onPick}>
            {picking && <Loader2 className="animate-spin" />} Escolher {name}
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DialogTriggerArea({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <DialogTrigger asChild>
      <button
        type="button"
        className="flex min-w-0 flex-1 items-start gap-2.5 rounded-sm text-left focus-visible:outline-2 focus-visible:outline-brand"
        aria-label={`Ver detalhes de ${name}`}
      >
        {children}
      </button>
    </DialogTrigger>
  );
}

function PlayerDetails({ name, avatar, info }: { name: string; avatar: string | null; info: PickInfo | undefined }) {
  if (!info) return <p className="text-sm text-muted">Sem dados de partidas ainda.</p>;
  const stats = [
    { label: "Ranking", value: info.position ? `#${info.position} de ${info.ranked}` : "—" },
    { label: "ELO", value: String(info.elo) },
    { label: "Mixes", value: String(info.mixes) },
    { label: "Vitórias", value: info.mixes ? `${Math.round(info.winRate)}%` : "—" },
    { label: "Nota (5 últimos)", value: info.rating != null ? info.rating.toFixed(2).replace(".", ",") : "—" },
    { label: "ELO em 30 dias", value: `${info.eloChange30d > 0 ? "+" : ""}${info.eloChange30d}` },
  ];
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Avatar name={name} src={avatar} size="lg" />
        <div>
          <div className="font-display text-lg font-bold">{name}</div>
          {info.recent.length > 0 && (
            <div className="mt-1 flex items-center gap-1 text-xs text-muted">
              Últimos mixes:
              {info.recent.map((r, i) => (
                <span
                  key={i}
                  className={cn("size-2.5 rounded-full", RESULT[r])}
                  title={r === "win" ? "Vitória" : r === "loss" ? "Derrota" : "Empate"}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <dl className="grid grid-cols-3 gap-2">
        {stats.map((s) => (
          <div key={s.label} className="rounded-md border border-border bg-surface-2 px-2 py-1.5">
            <dt className="text-[10px] font-semibold tracking-wide text-muted uppercase">{s.label}</dt>
            <dd className="font-display font-bold tabular">{s.value}</dd>
          </div>
        ))}
      </dl>

      {info.bestMaps.length > 0 && (
        <div>
          <h3 className="mb-1.5 text-[11px] font-semibold tracking-wider text-muted uppercase">Melhores mapas</h3>
          <ul className="flex flex-wrap gap-2">
            {info.bestMaps.map((m) => (
              <li
                key={m.mapId}
                className="flex items-center gap-2 rounded-md border border-border bg-surface-2 px-2.5 py-1 text-sm"
              >
                <MapIcon id={m.mapId} size={18} />
                {m.name}
                <span className="text-xs text-muted tabular">
                  {Math.round(m.winRate)}% · {m.played}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h3 className="mb-1.5 text-[11px] font-semibold tracking-wider text-muted uppercase">
          Insígnias ativas ({info.badges.length})
        </h3>
        {info.badges.length ? (
          <ul className="max-h-64 space-y-2 overflow-y-auto pr-1">
            {info.badges.map((b) => (
              <li key={b.id} className="flex items-start gap-2.5">
                <BadgeIcon icon={b.icon} color={b.color} size="sm" />
                <div className="min-w-0 text-sm">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium" style={{ color: b.color }}>
                      {b.name}
                    </span>
                    <span className="text-[10px] font-semibold tracking-wide text-subtle uppercase">
                      {b.kind === "dynamic" ? "Dinâmica" : "Permanente"}
                    </span>
                  </div>
                  <div className="text-xs text-muted">
                    {b.reason ?? b.description}
                    {(b.reason ?? b.description) ? " · " : ""}desde {formatDate(b.since)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-subtle">Nenhuma insígnia ativa.</p>
        )}
      </div>
    </div>
  );
}
