"use client";

import { Check, Crown, Loader2, RotateCcw, Swords, Trophy } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { pickPlayer, resetDraft, submitPpt, type DraftResult } from "@/app/(app)/draft/actions";
import { cn } from "@/lib/utils";
import type { DraftView, PptChoice } from "@/services/mix-events";
import { Avatar } from "../ui/avatar";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { TeamDot } from "../mixes/badges";
import { BadgeIcon } from "../badges/badge-icon";
import { WinProbability } from "./win-probability";
import { PickPlayer } from "./pick-player";
import type { PickInfo } from "@/lib/pick-types";

const CHOICES: { id: PptChoice; label: string; emoji: string }[] = [
  { id: "rock", label: "Pedra", emoji: "✊" },
  { id: "paper", label: "Papel", emoji: "✋" },
  { id: "scissors", label: "Tesoura", emoji: "✌️" },
];
const choiceLabel = (c: PptChoice | null) => CHOICES.find((x) => x.id === c);
/** Escolhas por turno (docs/especificacao-tecnica.md, 4.8). */
const TURN_PATTERN = [1, 2, 2, 2, 1];

function useRun() {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<DraftResult>) =>
    start(async () => {
      const r = await fn();
      if (r.ok) toast.success(r.message);
      else toast.error(r.message);
    });
  return [pending, run] as const;
}

export function DraftPanel({
  scheduleId,
  date,
  draft,
  names,
  avatars = {},
  classified,
  viewerId,
  isAdmin,
  probA = null,
  info = {},
}: {
  scheduleId: string;
  date: string;
  draft: DraftView;
  names: Record<string, string>;
  avatars?: Record<string, string | null>;
  classified: string[];
  viewerId: string | null;
  isAdmin: boolean;
  /** Chance do time A, com os times completos. */
  probA?: number | null;
  /** Resumo e insígnias de cada jogador (PICK). */
  info?: Record<string, PickInfo>;
}) {
  const [pending, run] = useRun();
  const name = (id: string | null) => (id ? (names[id] ?? "Jogador") : "—");
  const avatar = (id: string | null) => (id ? (avatars[id] ?? null) : null);
  const mySide = viewerId === draft.captainA ? "a" : viewerId === draft.captainB ? "b" : null;

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Swords className="size-4 text-brand" aria-hidden />
          <h2 className="font-display text-sm font-semibold tracking-wide uppercase">Seleção de equipes</h2>
          {draft.status === "ppt" && <Badge variant="brand">Pedra, papel ou tesoura</Badge>}
          {draft.status === "draft" && <Badge variant="brand">Escolha dos times</Badge>}
          {draft.status === "completed" && <Badge variant="win">Times definidos</Badge>}
        </div>
        {isAdmin && (
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() =>
                confirm("Reiniciar a escolha? Os votos de capitão são mantidos.") &&
                run(() => resetDraft(scheduleId, date, "draft"))
              }
            >
              <RotateCcw /> Reiniciar escolha
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-loss hover:text-loss"
              disabled={pending}
              onClick={() =>
                confirm("Reiniciar tudo? A escolha e os votos de capitão serão apagados.") &&
                run(() => resetDraft(scheduleId, date, "all"))
              }
            >
              <RotateCcw /> Reiniciar tudo
            </Button>
          </div>
        )}
      </div>

      {draft.status === "completed" && probA != null && (
        <WinProbability
          probA={probA}
          nameA={`Time ${name(draft.teamA[0] ?? null)}`}
          nameB={`Time ${name(draft.teamB[0] ?? null)}`}
          className="border-b border-border px-4 py-3"
        />
      )}
      {draft.status === "ppt" ? (
        <PptStage scheduleId={scheduleId} date={date} draft={draft} name={name} avatar={avatar} mySide={mySide} />
      ) : (
        <PickStage
          scheduleId={scheduleId}
          date={date}
          draft={draft}
          name={name}
          avatar={avatar}
          classified={classified}
          mySide={mySide}
          info={info}
        />
      )}
    </Card>
  );
}

function PptStage({
  scheduleId,
  date,
  draft,
  name,
  avatar,
  mySide,
}: {
  scheduleId: string;
  date: string;
  draft: DraftView;
  name: (id: string | null) => string;
  avatar: (id: string | null) => string | null;
  mySide: "a" | "b" | null;
}) {
  const [choice, setChoice] = useState<PptChoice | null>(null);
  const [pending, run] = useRun();
  const myReady = mySide === "a" ? draft.aReady : mySide === "b" ? draft.bReady : false;
  const tie = choiceLabel(draft.lastTieChoice);

  return (
    <div className="space-y-4 p-4 sm:p-5">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <CaptainCard
          side="A"
          name={name(draft.captainA)}
          src={avatar(draft.captainA)}
          ready={draft.aReady}
          me={mySide === "a"}
        />
        <span className="font-display text-sm font-bold text-subtle">VS</span>
        <CaptainCard
          side="B"
          name={name(draft.captainB)}
          src={avatar(draft.captainB)}
          ready={draft.bReady}
          me={mySide === "b"}
        />
      </div>

      {tie && (
        <p className="rounded-md border border-border bg-surface-2 px-3 py-2 text-center text-sm text-muted">
          O round anterior empatou com{" "}
          <span className="font-semibold text-fg">
            {tie.emoji} {tie.label}
          </span>
          {draft.tieCount > 1 && ` (${draft.tieCount} empates)`}. Escolham de novo!
        </p>
      )}

      {mySide && !myReady ? (
        <div className="space-y-3">
          <p className="text-center text-sm text-muted">
            Você é capitão. Escolha sua jogada — o adversário só verá depois que os dois confirmarem.
          </p>
          <div className="grid grid-cols-3 gap-2">
            {CHOICES.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={choice === c.id}
                onClick={() => setChoice(c.id)}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-lg border py-4 transition-colors",
                  choice === c.id
                    ? "border-brand bg-brand/10"
                    : "border-border bg-surface-2 hover:border-border-strong",
                )}
              >
                <span className="text-3xl" aria-hidden>
                  {c.emoji}
                </span>
                <span className="text-sm font-medium">{c.label}</span>
              </button>
            ))}
          </div>
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            disabled={!choice || pending}
            onClick={() => choice && run(() => submitPpt(scheduleId, date, choice))}
          >
            {pending && <Loader2 className="animate-spin" />} Estou pronto
          </Button>
        </div>
      ) : (
        <p className="text-center text-sm text-muted">
          {mySide ? "Jogada confirmada. Aguardando o outro capitão…" : "Os capitães estão escolhendo suas jogadas…"}
        </p>
      )}
    </div>
  );
}

function CaptainCard({
  side,
  name,
  src,
  ready,
  me,
}: {
  side: "A" | "B";
  name: string;
  src: string | null;
  ready: boolean;
  me: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2 rounded-lg border p-3 text-center",
        me ? "border-brand/50 bg-brand/5" : "border-border bg-surface-2",
      )}
    >
      <Avatar name={name} src={src} size="md" />
      <div className="flex items-center gap-1.5 font-medium">
        <TeamDot side={side} /> {name}
      </div>
      {ready ? (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-win">
          <Check className="size-3.5" /> Pronto
        </span>
      ) : (
        <span className="text-xs text-muted">Escolhendo…</span>
      )}
    </div>
  );
}

function PickStage({
  scheduleId,
  date,
  draft,
  name,
  avatar,
  classified,
  mySide,
  info,
}: {
  scheduleId: string;
  date: string;
  draft: DraftView;
  name: (id: string | null) => string;
  avatar: (id: string | null) => string | null;
  classified: string[];
  mySide: "a" | "b" | null;
  info: Record<string, PickInfo>;
}) {
  const [pending, run] = useRun();
  const [picking, setPicking] = useState<string | null>(null);
  const taken = new Set([...draft.teamA, ...draft.teamB]);
  const available = classified.filter((id) => !taken.has(id));
  const myTurn = draft.status === "draft" && mySide !== null && draft.currentTurn === mySide;
  const turnCaptain = draft.currentTurn === "a" ? draft.captainA : draft.captainB;
  const left = draft.status === "draft" ? (TURN_PATTERN[draft.turnNumber] ?? 0) - draft.picksInTurn : 0;
  const a = choiceLabel(draft.revealedA);
  const b = choiceLabel(draft.revealedB);

  return (
    <div className="space-y-4 p-4 sm:p-5">
      {draft.winner && a && b && (
        <p className="text-center text-sm text-muted">
          <Trophy className="mr-1 inline size-4 text-brand" />
          <span className="font-semibold text-fg">{name(draft.winner)}</span> venceu no PPT ({a.emoji} {a.label} ×{" "}
          {b.emoji} {b.label}) e escolheu primeiro.
        </p>
      )}

      {draft.status === "draft" && (
        <div
          className={cn(
            "rounded-md border px-3 py-2 text-center text-sm",
            myTurn ? "border-brand bg-brand/10 font-medium text-fg" : "border-border bg-surface-2 text-muted",
          )}
        >
          {myTurn
            ? `Sua vez! Escolha ${left} jogador${left > 1 ? "es" : ""}.`
            : `Vez de ${name(turnCaptain)} — ${left} escolha${left > 1 ? "s" : ""} restante${left > 1 ? "s" : ""}.`}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {(["a", "b"] as const).map((side) => {
          const team = side === "a" ? draft.teamA : draft.teamB;
          const captain = side === "a" ? draft.captainA : draft.captainB;
          return (
            <div
              key={side}
              className={cn("rounded-lg border p-3", draft.currentTurn === side ? "border-brand/50" : "border-border")}
            >
              <div className="mb-2 flex items-center gap-2 font-display text-sm font-semibold uppercase">
                <TeamDot side={side === "a" ? "A" : "B"} /> Time {name(captain)}
                <span className="ml-auto text-xs text-muted tabular">{team.length}/5</span>
              </div>
              <ol className="space-y-1">
                {team.map((id, i) => (
                  <li key={id} className="flex items-center gap-2 text-sm">
                    <span className="w-5 text-right font-display text-xs text-subtle tabular">{i + 1}º</span>
                    <Avatar name={name(id)} src={avatar(id)} size="xs" />
                    <span className="min-w-0 truncate">{name(id)}</span>
                    {id === captain && <Crown className="size-3.5 shrink-0 text-brand" aria-label="Capitão" />}
                    <TeamBadges badges={info[id]?.badges ?? []} />
                  </li>
                ))}
              </ol>
            </div>
          );
        })}
      </div>

      {draft.status === "draft" && available.length > 0 && (
        <div>
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <span className="text-[11px] font-semibold tracking-wider text-muted uppercase">Disponíveis</span>
            <span className="text-[11px] text-subtle">Toque no jogador para ver detalhes e insígnias</span>
          </div>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {available.map((id) => (
              <li key={id}>
                <PickPlayer
                  name={name(id)}
                  avatar={avatar(id)}
                  info={info[id]}
                  canPick={myTurn}
                  picking={pending && picking === id}
                  disabled={pending}
                  onPick={() => {
                    setPicking(id);
                    run(() => pickPlayer(scheduleId, date, id));
                  }}
                />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Insígnias ativas ao lado do nome nos times (as mais relevantes primeiro; o resto vira +N). */
function TeamBadges({ badges }: { badges: PickInfo["badges"] }) {
  const shown = badges.slice(0, 4);
  const more = badges.length - shown.length;
  return (
    <span className="ml-1 flex shrink-0 items-center gap-0.5" aria-label="Insígnias">
      {shown.map((b) => (
        <BadgeIcon
          key={b.id}
          icon={b.icon}
          color={b.color}
          size="xs"
          className="size-5"
          title={[b.name, b.reason ?? b.description].filter(Boolean).join(" — ")}
        />
      ))}
      {more > 0 && <span className="pl-0.5 text-[10px] text-muted tabular">+{more}</span>}
    </span>
  );
}
