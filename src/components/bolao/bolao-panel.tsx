"use client";

import { Check, Flame, Loader2, Lock, Pencil, Target, Trophy, X } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { savePrediction } from "@/app/(app)/bolao/actions";
import { BOLAO_POINTS, scoreOptions, type Prediction } from "@/lib/bolao";
import { cn } from "@/lib/utils";
import type { BolaoEntry, BolaoView } from "@/services/bolao";
import { TeamDot } from "../mixes/badges";
import { Avatar } from "../ui/avatar";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card } from "../ui/card";

const TZ = "America/Sao_Paulo";
const hourMin = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: TZ });

type People = Record<string, { name: string; avatarUrl: string | null }>;

/** Bolão do mix: todo cadastrado palpita (jogando ou não) até o mix começar. */
export function BolaoPanel({
  scheduleId,
  date,
  bolao,
  people,
  loggedIn,
}: {
  scheduleId: string;
  date: string;
  bolao: BolaoView;
  people: People;
  loggedIn: boolean;
}) {
  const name = (id: string | null) => (id ? (people[id]?.name ?? "Jogador") : "—");
  const teamName = (i: 0 | 1) => `Time ${name(bolao.captains[i])}`;

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Target className="size-4 text-brand" aria-hidden />
          <h3 className="font-display text-sm font-semibold tracking-wide uppercase">Bolão do mix</h3>
          {bolao.status === "open" && <Badge variant="win">Aberto até {hourMin(bolao.closesAt)}</Badge>}
          {bolao.status === "closed" && (
            <Badge variant="neutral">
              <Lock /> Fechado
            </Badge>
          )}
          {bolao.status === "final" && <Badge variant="brand">Resultado</Badge>}
        </div>
        <Link href="/bolao" className="text-xs font-medium text-muted hover:text-brand">
          Ranking do bolão →
        </Link>
      </div>

      {bolao.status === "open" ? (
        <OpenForm scheduleId={scheduleId} date={date} bolao={bolao} people={people} loggedIn={loggedIn} />
      ) : (
        <Results
          bolao={bolao}
          name={name}
          names={Object.fromEntries(Object.entries(people).map(([id, p]) => [id, p.name]))}
          teamName={teamName}
        />
      )}
    </Card>
  );
}

function Split({ bolao, teamName }: { bolao: BolaoView; teamName: (i: 0 | 1) => string }) {
  const [a, b] = bolao.split;
  const total = a + b;
  if (!total) return <p className="text-xs text-subtle">Ninguém palpitou ainda. Seja o primeiro!</p>;
  const pa = Math.round((a / total) * 100);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[11px] font-semibold">
        <span className="text-team-a">
          {teamName(0)} · {pa}%
        </span>
        <span className="text-muted">
          {total} palpite{total > 1 ? "s" : ""}
        </span>
        <span className="text-team-b">
          {100 - pa}% · {teamName(1)}
        </span>
      </div>
      <div className="flex h-1.5 overflow-hidden rounded-full bg-surface-3">
        <div className="bg-team-a" style={{ width: `${pa}%` }} />
        <div className="bg-team-b" style={{ width: `${100 - pa}%` }} />
      </div>
    </div>
  );
}

function PlayerPicker({
  value,
  onChange,
  other,
  label,
  icon: Icon,
  points,
  teams,
  people,
  disabled,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  other: string | null;
  label: string;
  icon: typeof Trophy;
  points: number;
  teams: [string[], string[]];
  people: People;
  disabled: boolean;
}) {
  const name = (id: string) => people[id]?.name ?? "Jogador";
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-muted uppercase">
        <Icon className="size-3.5" aria-hidden /> {label}{" "}
        <span className="font-normal tracking-normal normal-case">(+{points})</span>
      </div>
      {/* Celular: uma coluna por time; telas largas: uma linha por time. */}
      <div
        className={cn(
          "grid grid-cols-2 gap-1.5 sm:grid-cols-5",
          teams[0].length === 5 &&
            teams[1].length === 5 &&
            "grid-flow-col grid-rows-5 sm:grid-flow-row sm:grid-rows-none",
        )}
      >
        {[...teams[0], ...teams[1]].map((id) => (
          <button
            key={id}
            type="button"
            disabled={disabled || id === other}
            onClick={() => onChange(value === id ? null : id)}
            aria-pressed={value === id}
            className={cn(
              "flex min-w-0 items-center gap-1.5 rounded-md border px-2 py-1.5 text-left text-xs transition-colors disabled:opacity-40",
              value === id ? "border-brand bg-brand/12 text-fg" : "border-border hover:border-border-strong",
            )}
          >
            <TeamDot side={teams[0].includes(id) ? "A" : "B"} />
            <Avatar name={name(id)} src={people[id]?.avatarUrl} size="xs" />
            <span className="truncate">{name(id)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Quem já palpitou: só foto e nick (o palpite fica escondido até fechar). */
function Voters({ voters }: { voters: BolaoView["voters"] }) {
  if (!voters.length) return null;
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-semibold tracking-wider text-muted uppercase">
        Já palpitaram ({voters.length})
      </div>
      <ul className="flex flex-wrap gap-1.5">
        {voters.map((v) => (
          <li
            key={v.userId}
            className="flex items-center gap-1.5 rounded-full border border-border bg-surface-2/50 py-0.5 pr-2.5 pl-0.5 text-xs"
          >
            <Avatar name={v.name} src={v.avatarUrl} size="xs" className="rounded-full" />
            {v.name}
          </li>
        ))}
      </ul>
    </div>
  );
}

function OpenForm({
  scheduleId,
  date,
  bolao,
  people,
  loggedIn,
}: {
  scheduleId: string;
  date: string;
  bolao: BolaoView;
  people: People;
  loggedIn: boolean;
}) {
  const mine = bolao.mine;
  const [winner, setWinner] = useState<string | null>(mine?.winnerCaptain ?? null);
  const options = scoreOptions(bolao.mapsCount);
  const [score, setScore] = useState(() => {
    const i = options.findIndex((o) => o.won === mine?.mapsWon && o.lost === mine?.mapsLost);
    return i >= 0 ? i : 0;
  });
  const [mvp, setMvp] = useState<string | null>(mine?.mvpId ?? null);
  const [lanterna, setLanterna] = useState<string | null>(mine?.lanternaId ?? null);
  const [pending, start] = useTransition();
  // Depois de palpitar, as opções ficam recolhidas; "Atualizar palpite" abre de novo.
  const [editing, setEditing] = useState(!mine);
  const showForm = editing || !mine || !loggedIn;
  const name = (id: string) => people[id]?.name ?? "Jogador";
  const teamName = (i: 0 | 1) => `Time ${name(bolao.captains[i])}`;
  const cancel = () => {
    setWinner(mine?.winnerCaptain ?? null);
    setScore(
      Math.max(
        0,
        options.findIndex((o) => o.won === mine?.mapsWon && o.lost === mine?.mapsLost),
      ),
    );
    setMvp(mine?.mvpId ?? null);
    setLanterna(mine?.lanternaId ?? null);
    setEditing(false);
  };

  const save = () => {
    if (!winner) return toast.error("Escolha quem vence.");
    const o = options[score]!;
    start(async () => {
      const r = await savePrediction(scheduleId, date, {
        winnerCaptain: winner,
        mapsWon: o.won,
        mapsLost: o.lost,
        mvpId: mvp,
        lanternaId: lanterna,
      });
      if (r.ok) {
        toast.success(r.message);
        setEditing(false);
      } else toast.error(r.message);
    });
  };

  return (
    <div className="space-y-4 p-4 sm:p-5">
      <Split bolao={bolao} teamName={teamName} />
      <Voters voters={bolao.voters} />

      {showForm && (
        <>
          <div>
            <div className="mb-1.5 text-[11px] font-semibold tracking-wider text-muted uppercase">
              Quem vence? <span className="font-normal tracking-normal normal-case">(+{BOLAO_POINTS.winner})</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {([0, 1] as const).map((i) => (
                <button
                  key={i}
                  type="button"
                  disabled={!loggedIn}
                  onClick={() => setWinner(bolao.captains[i])}
                  aria-pressed={winner === bolao.captains[i]}
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-md border px-3 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50",
                    winner === bolao.captains[i]
                      ? i === 0
                        ? "border-team-a bg-team-a/15 text-team-a"
                        : "border-team-b bg-team-b/15 text-team-b"
                      : "border-border hover:border-border-strong",
                  )}
                >
                  <TeamDot side={i === 0 ? "A" : "B"} /> {teamName(i)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1.5 text-[11px] font-semibold tracking-wider text-muted uppercase">
              Placar de mapas{" "}
              <span className="font-normal tracking-normal normal-case">
                (+{BOLAO_POINTS.score} se acertar com o vencedor)
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {options.map((o, i) => (
                <button
                  key={`${o.won}-${o.lost}`}
                  type="button"
                  disabled={!loggedIn}
                  onClick={() => setScore(i)}
                  aria-pressed={score === i}
                  className={cn(
                    "rounded-md border px-3 py-1.5 font-display text-sm font-bold tabular transition-colors disabled:opacity-50",
                    score === i ? "border-brand bg-brand/12 text-brand" : "border-border hover:border-border-strong",
                  )}
                >
                  {o.won} × {o.lost}
                </button>
              ))}
            </div>
          </div>

          <PlayerPicker
            value={mvp}
            onChange={setMvp}
            other={lanterna}
            label="MVP"
            icon={Trophy}
            points={BOLAO_POINTS.mvp}
            teams={bolao.teams}
            people={people}
            disabled={!loggedIn}
          />
          <PlayerPicker
            value={lanterna}
            onChange={setLanterna}
            other={mvp}
            label="Lanterna"
            icon={Flame}
            points={BOLAO_POINTS.lanterna}
            teams={bolao.teams}
            people={people}
            disabled={!loggedIn}
          />
        </>
      )}

      {loggedIn ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          {mine ? (
            // Resumo do palpite salvo (só o seu: os dos outros ficam escondidos até fechar).
            <p className="text-xs text-muted">
              Você já palpitou:{" "}
              <span className="font-semibold text-fg">
                Time {name(mine.winnerCaptain)} · {mine.mapsWon}×{mine.mapsLost}
                {mine.mvpId && ` · MVP ${name(mine.mvpId)}`}
                {mine.lanternaId && ` · Lanterna ${name(mine.lanternaId)}`}
              </span>
              . Pode mudar até {hourMin(bolao.closesAt)}.
            </p>
          ) : (
            <p className="text-xs text-muted">
              Palpites ficam escondidos até {hourMin(bolao.closesAt)}; depois todos aparecem.
            </p>
          )}
          {mine && !editing ? (
            <Button variant="primary" size="sm" onClick={() => setEditing(true)}>
              <Pencil /> Atualizar palpite
            </Button>
          ) : (
            <div className="flex gap-2">
              {mine && (
                <Button variant="ghost" size="sm" disabled={pending} onClick={cancel}>
                  Cancelar
                </Button>
              )}
              <Button variant="primary" size="sm" disabled={pending || !winner} onClick={save}>
                {pending ? <Loader2 className="animate-spin" /> : <Check />} Salvar palpite
              </Button>
            </div>
          )}
        </div>
      ) : (
        <p className="border-t border-border pt-3 text-sm text-muted">
          <Link href="/entrar?next=/dashboard" className="text-brand hover:underline">
            Entre na sua conta
          </Link>{" "}
          para palpitar. Vale para todo cadastrado, jogando ou não.
        </p>
      )}
    </div>
  );
}

function Hit({ ok, children }: { ok: boolean | null; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5",
        ok == null ? "bg-surface-2 text-muted" : ok ? "bg-win/12 text-win" : "bg-surface-2 text-subtle line-through",
      )}
    >
      {ok != null &&
        (ok ? <Check className="size-3" aria-label="acertou" /> : <X className="size-3" aria-label="errou" />)}
      {children}
    </span>
  );
}

/** Palpite em uma linha, com ✓/✗ quando o mix já foi conferido. */
export function PredictionLine({
  p,
  score,
  names,
}: {
  p: Prediction;
  score: BolaoEntry["score"];
  names: Record<string, string>;
}) {
  const name = (id: string) => names[id] ?? "Jogador";
  return (
    <div className="flex flex-wrap gap-1 text-[11px]">
      <Hit ok={score ? score.winner : null}>Time {name(p.winnerCaptain)}</Hit>
      <Hit ok={score ? score.score : null}>
        {p.mapsWon}×{p.mapsLost}
      </Hit>
      {p.mvpId && <Hit ok={score ? score.mvp : null}>MVP {name(p.mvpId)}</Hit>}
      {p.lanternaId && <Hit ok={score ? score.lanterna : null}>Lanterna {name(p.lanternaId)}</Hit>}
    </div>
  );
}

function Results({
  bolao,
  name,
  names,
  teamName,
}: {
  bolao: BolaoView;
  name: (id: string | null) => string;
  names: Record<string, string>;
  teamName: (i: 0 | 1) => string;
}) {
  const entries = bolao.entries ?? [];
  const o = bolao.outcome;
  return (
    <div className="space-y-3 p-4 sm:p-5">
      {o ? (
        <p className="text-sm text-muted">
          Deu{" "}
          <span className="font-semibold text-fg">{o.winnerCaptain ? `Time ${name(o.winnerCaptain)}` : "empate"}</span>{" "}
          {o.mapsWon}×{o.mapsLost} · MVP <span className="text-fg">{name(o.mvpId)}</span> · Lanterna{" "}
          <span className="text-fg">{name(o.lanternaId)}</span>
        </p>
      ) : (
        <Split bolao={bolao} teamName={teamName} />
      )}
      {entries.length ? (
        <ul className="divide-y divide-border">
          {entries.map((e) => (
            <li key={e.userId} className="flex items-center gap-3 py-2">
              <Avatar name={e.name} src={e.avatarUrl} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{e.name}</div>
                <PredictionLine p={e.prediction} score={e.score} names={names} />
              </div>
              {e.score && (
                <span
                  className={cn(
                    "shrink-0 font-display text-lg font-bold tabular",
                    e.score.points ? "text-brand" : "text-subtle",
                  )}
                >
                  {e.score.points}
                  <span className="text-xs font-medium text-muted"> pts</span>
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-subtle">Ninguém palpitou neste mix.</p>
      )}
    </div>
  );
}
