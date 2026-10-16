"use client";

import { AlertCircle, Check, Info, Shuffle } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { balanceTeams } from "@/lib/teams";
import { cn } from "@/lib/utils";
import { Avatar } from "../ui/avatar";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader } from "../ui/card";
import { Input, Label, Select } from "../ui/input";
import { TeamDot } from "./badges";

interface PlayerOption {
  id: string;
  nickname: string;
  elo: number;
}

const TEAM_SIZE = 5;
const FORMATS = { bo1: 1, bo3: 3 } as const;

/**
 * Formulário de criação de mix. Ainda não há persistência: ao enviar, o mix
 * é validado e o usuário é informado de que não foi salvo. Quando a fonte
 * Supabase existir, substituir `onSubmit` por uma Server Action.
 */
export function NewMixForm({ players, maps }: { players: PlayerOption[]; maps: { id: string; name: string }[] }) {
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [format, setFormat] = useState<keyof typeof FORMATS>("bo1");
  const [selectedMaps, setSelectedMaps] = useState<string[]>([]);
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [twitch, setTwitch] = useState("");
  const [filter, setFilter] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const elos = useMemo(() => new Map(players.map((p) => [p.id, p.elo])), [players]);
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const teams = selectedPlayers.length === TEAM_SIZE * 2 ? balanceTeams(selectedPlayers, elos, TEAM_SIZE) : null;
  const mapLimit = FORMATS[format];

  const toggle = (list: string[], id: string, max: number) =>
    list.includes(id) ? list.filter((x) => x !== id) : list.length < max ? [...list, id] : list;

  function validate() {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Informe um nome para o mix.";
    if (!date) e.date = "Informe data e horário.";
    if (selectedMaps.length !== mapLimit) e.maps = `Selecione ${mapLimit} ${mapLimit > 1 ? "mapas" : "mapa"}.`;
    if (selectedPlayers.length !== TEAM_SIZE * 2) e.players = `Selecione ${TEAM_SIZE * 2} jogadores.`;
    if (twitch && !/^https:\/\/(www\.)?twitch\.tv\/[\w-]+/i.test(twitch))
      e.twitch = "Use um link no formato https://twitch.tv/canal.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!validate()) {
      toast.error("Revise os campos destacados.");
      return;
    }
    toast.info("Mix validado, mas não foi salvo", {
      description: "O salvamento de mixes será habilitado quando o banco de dados for conectado.",
    });
  }

  const visiblePlayers = players.filter((p) => p.nickname.toLowerCase().includes(filter.toLowerCase()));

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4 lg:grid-cols-[1fr_22rem]">
      <div className="min-w-0 space-y-4">
        <div
          role="note"
          className="flex gap-3 rounded-md border border-border bg-surface-2/60 px-4 py-3 text-sm text-muted"
        >
          <Info className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
          <p>
            <strong className="text-fg">Salvamento ainda não disponível.</strong> Você pode montar e validar o mix, mas
            ele não será gravado até a conexão com o banco de dados ser implementada.
          </p>
        </div>

        <Card>
          <CardHeader title="Informações" />
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field id="name" label="Nome do mix" error={errors.name}>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Mix de sexta"
                aria-invalid={!!errors.name}
              />
            </Field>
            <Field id="date" label="Data e horário" error={errors.date}>
              <Input
                id="date"
                type="datetime-local"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                aria-invalid={!!errors.date}
              />
            </Field>
            <Field id="format" label="Formato">
              <Select
                id="format"
                value={format}
                onChange={(e) => {
                  const f = e.target.value as keyof typeof FORMATS;
                  setFormat(f);
                  setSelectedMaps((m) => m.slice(0, FORMATS[f]));
                }}
              >
                <option value="bo1">Melhor de 1 (BO1)</option>
                <option value="bo3">Melhor de 3 (BO3)</option>
              </Select>
            </Field>
            <Field id="twitch" label="Transmissão na Twitch (opcional)" error={errors.twitch}>
              <Input
                id="twitch"
                type="url"
                value={twitch}
                onChange={(e) => setTwitch(e.target.value)}
                placeholder="https://twitch.tv/canal"
                aria-invalid={!!errors.twitch}
              />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader title="Mapas" description={`${selectedMaps.length}/${mapLimit} selecionados`} />
          <CardContent>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {maps.map((m) => {
                const i = selectedMaps.indexOf(m.id);
                const active = i >= 0;
                return (
                  <button
                    key={m.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setSelectedMaps((s) => toggle(s, m.id, mapLimit))}
                    className={cn(
                      "flex h-10 items-center justify-between rounded-md border px-3 text-sm font-medium transition-colors",
                      active
                        ? "border-brand bg-brand/10 text-fg"
                        : "border-border bg-surface-2 text-muted hover:border-border-strong hover:text-fg",
                    )}
                  >
                    {m.name}
                    {active && (
                      <span className="font-display text-xs font-bold text-brand">
                        {mapLimit > 1 ? i + 1 : <Check className="size-4" />}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {errors.maps && <FieldError>{errors.maps}</FieldError>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader title="Jogadores" description={`${selectedPlayers.length}/${TEAM_SIZE * 2} selecionados`} />
          <CardContent>
            <Input
              placeholder="Filtrar jogadores…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="mb-3"
              aria-label="Filtrar jogadores"
            />
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {visiblePlayers.map((p) => {
                const active = selectedPlayers.includes(p.id);
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      aria-pressed={active}
                      onClick={() => setSelectedPlayers((s) => toggle(s, p.id, TEAM_SIZE * 2))}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                        active ? "border-brand bg-brand/10" : "border-border bg-surface-2 hover:border-border-strong",
                      )}
                    >
                      <Avatar name={p.nickname} size="xs" />
                      <span className="flex-1 truncate font-medium">{p.nickname}</span>
                      <span className="text-xs text-muted tabular">{p.elo}</span>
                      <span
                        className={cn(
                          "flex size-4 items-center justify-center rounded-sm border",
                          active ? "border-brand bg-brand text-brand-fg" : "border-border-strong",
                        )}
                      >
                        {active && <Check className="size-3" />}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {!visiblePlayers.length && (
              <p className="py-4 text-center text-sm text-muted">Nenhum jogador encontrado.</p>
            )}
            {errors.players && <FieldError>{errors.players}</FieldError>}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        <Card>
          <CardHeader
            title="Divisão dos times"
            description="Sugestão automática por ELO"
            action={<Shuffle className="size-4 text-subtle" aria-hidden />}
          />
          {teams ? (
            <div className="divide-y divide-border">
              {(
                [
                  ["A", teams.a, teams.avgA],
                  ["B", teams.b, teams.avgB],
                ] as const
              ).map(([side, ids, avg]) => (
                <div key={side} className="p-4">
                  <div className="mb-2 flex items-center justify-between text-xs font-semibold tracking-wider text-muted uppercase">
                    <span className="flex items-center gap-2">
                      <TeamDot side={side} /> Time {byId.get(ids[0]!)?.nickname}
                    </span>
                    <span className="tabular">ELO médio {Math.round(avg)}</span>
                  </div>
                  <ul className="space-y-1 text-sm">
                    {ids.map((id) => (
                      <li key={id} className="flex justify-between">
                        <span>{byId.get(id)?.nickname}</span>
                        <span className="text-muted tabular">{elos.get(id)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <div className="px-4 py-3 text-xs text-muted">
                Diferença de ELO médio:{" "}
                <span className="font-semibold text-fg tabular">{Math.abs(Math.round(teams.avgA - teams.avgB))}</span>
              </div>
            </div>
          ) : (
            <p className="p-4 text-sm text-muted">Selecione {TEAM_SIZE * 2} jogadores para ver a sugestão de times.</p>
          )}
        </Card>
        <Button type="submit" variant="primary" size="lg" className="w-full">
          Validar mix
        </Button>
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && <FieldError>{error}</FieldError>}
    </div>
  );
}

function FieldError({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="mt-1.5 flex items-center gap-1 text-xs text-loss">
      <AlertCircle className="size-3.5" aria-hidden /> {children}
    </p>
  );
}
