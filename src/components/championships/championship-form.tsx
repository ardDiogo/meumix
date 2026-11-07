"use client";

import { ImagePlus, KeyRound, Loader2, Plus, Shuffle, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createChampionship, updateChampionship } from "@/app/(app)/campeonatos/actions";
import {
  formatMoney,
  MAX_TEAMS,
  PLAYERS_PER_TEAM,
  GROUP_FORMAT_LABEL,
  PLAYOFF_FORMAT_LABEL,
  prizeDistribution,
  STATUS_LABEL,
  STATUS_ORDER,
  validateChampionship,
  WEEKDAYS_SHORT,
  type ChampionshipInput,
  type GroupFormat,
  type PlayoffFormat,
  type TeamMode,
} from "@/lib/championship";
import { compressImage } from "@/lib/image-client";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader } from "../ui/card";
import { Input, Label, Select, Textarea } from "../ui/input";

const num = (v: string) => (v === "" ? NaN : Number(v.replace(",", ".")));

/**
 * Cadastro e edição do campeonato. Os potes seguem os jogadores por equipe
 * (o capitão é o jogador que não sai de pote).
 */
export function ChampionshipForm({
  initial,
  id,
  bannerUrl,
}: {
  initial: ChampionshipInput;
  /** Sem id: cria um campeonato novo. */
  id?: string;
  bannerUrl?: string | null;
}) {
  const router = useRouter();
  const [v, setV] = useState<ChampionshipInput>(initial);
  const [preview, setPreview] = useState<string | null>(bannerUrl ?? null);
  const [pending, start] = useTransition();
  // Os avisos só aparecem depois da primeira tentativa de salvar.
  const [tried, setTried] = useState(false);
  const set = <K extends keyof ChampionshipInput>(k: K, value: ChampionshipInput[K]) =>
    setV((old) => ({ ...old, [k]: value }));
  const errors = validateChampionship(v);
  const players = v.teamCount * v.playersPerTeam;
  const prize = prizeDistribution(v.entryFee || 0, players, v.prizeSplit, v.costs || 0);
  const splitSum = v.prizeSplit.reduce((s, p) => s + (p || 0), 0);

  const pickBanner = async (file: File | undefined) => {
    if (!file) return;
    try {
      const img = await compressImage(file, 1600);
      set("banner", img.data);
      setPreview(`data:${img.mimeType};base64,${img.data}`);
    } catch {
      toast.error("Não foi possível ler a imagem.");
    }
  };

  const submit = () =>
    start(async () => {
      setTried(true);
      if (errors.length) return void toast.error(errors[0]);
      const r = id ? await updateChampionship(id, v) : await createChampionship(v);
      if (!r.ok) return void toast.error(r.message);
      toast.success(r.message);
      if (!id && r.slug) router.push(`/campeonatos/${r.slug}`);
      else router.refresh();
    });

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Card>
        <CardHeader
          title="1. Como os times serão formados?"
          description="Defina primeiro: com os times já completos, o campeonato pula potes, adedonha e draft."
        />
        <CardContent className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Formação das equipes">
          {(
            [
              {
                mode: "code",
                icon: KeyRound,
                title: "Times já definidos",
                text: "Cada time recebe um código. Quem entra pelo código já está no time — sem potes, sem adedonha e sem draft.",
              },
              {
                mode: "draft",
                icon: Shuffle,
                title: "Times formados por draft",
                text: "Inscrições, capitães e potes; os capitães jogam a adedonha e escolhem os jogadores em serpentina.",
              },
            ] as const
          ).map((o) => {
            const on = v.teamMode === o.mode;
            const Icon = o.icon;
            return (
              <button
                key={o.mode}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => set("teamMode", o.mode as TeamMode)}
                className={cn(
                  "flex items-start gap-3 rounded-lg border p-4 text-left transition-colors",
                  on ? "border-brand bg-brand/10" : "border-border hover:border-border-strong",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2",
                    on ? "border-brand" : "border-border-strong",
                  )}
                >
                  {on && <span className="size-2.5 rounded-full bg-brand" />}
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 font-semibold text-fg">
                    <Icon className="size-4 text-brand" aria-hidden /> {o.title}
                  </span>
                  <span className="mt-1 block text-sm text-muted">{o.text}</span>
                </span>
              </button>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Informações" />
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="ch-name">Nome do campeonato</Label>
            <Input
              id="ch-name"
              value={v.name}
              maxLength={80}
              placeholder="Copa MeuMix"
              onChange={(e) => set("name", e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="ch-edition">Edição</Label>
            <Input
              id="ch-edition"
              value={v.edition}
              maxLength={40}
              placeholder="1ª edição"
              onChange={(e) => set("edition", e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="ch-desc">Descrição</Label>
            <Textarea
              id="ch-desc"
              value={v.description}
              maxLength={2000}
              rows={3}
              placeholder="Regras gerais, premiação, como funciona o draft…"
              onChange={(e) => set("description", e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Banner (imagem de capa)</Label>
            <div className="flex flex-wrap items-center gap-3">
              {preview && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="" className="h-20 w-40 rounded-md border border-border object-cover" />
              )}
              <Button variant="outline" size="sm" asChild>
                <label className="cursor-pointer">
                  <ImagePlus /> {preview ? "Trocar imagem" : "Escolher imagem"}
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => pickBanner(e.target.files?.[0])}
                  />
                </label>
              </Button>
              {preview && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    set("banner", null);
                    setPreview(null);
                  }}
                >
                  <Trash2 /> Remover
                </Button>
              )}
            </div>
          </div>
          <div>
            <Label htmlFor="ch-start">Data de início</Label>
            <Input
              id="ch-start"
              type="date"
              value={v.startsOn ?? ""}
              onChange={(e) => set("startsOn", e.target.value || null)}
            />
          </div>
          <div>
            <Label htmlFor="ch-end">Previsão de encerramento</Label>
            <Input
              id="ch-end"
              type="date"
              value={v.endsOn ?? ""}
              onChange={(e) => set("endsOn", e.target.value || null)}
            />
          </div>
          <div>
            <Label htmlFor="ch-status">Status</Label>
            <Select
              id="ch-status"
              value={v.status}
              onChange={(e) => set("status", e.target.value as ChampionshipInput["status"])}
            >
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Equipes e formato" description="O capitão é o líder e um dos jogadores do time." />
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="ch-teams">Equipes</Label>
            <Input
              id="ch-teams"
              type="number"
              min={2}
              max={MAX_TEAMS}
              value={Number.isNaN(v.teamCount) ? "" : v.teamCount}
              onChange={(e) => set("teamCount", num(e.target.value))}
            />
          </div>
          <div>
            <Label>Jogadores por equipe</Label>
            <div className="flex h-9 items-center rounded-md border border-border bg-surface px-3 text-sm text-muted">
              {PLAYERS_PER_TEAM} (5x5)
            </div>
          </div>
          {v.teamMode === "draft" ? (
            <div>
              <Label>Potes do draft</Label>
              <div className="flex h-9 items-center rounded-md border border-border bg-surface px-3 text-sm text-muted">
                {Number.isNaN(v.playersPerTeam) ? "-" : `${v.potCount} (capitão + ${v.potCount} escolhidos)`}
              </div>
            </div>
          ) : (
            <div className="hidden sm:block" />
          )}
          <div className="sm:col-span-2">
            <Label htmlFor="ch-group">Fase classificatória</Label>
            <Select
              id="ch-group"
              value={v.groupFormat}
              onChange={(e) => set("groupFormat", e.target.value as GroupFormat)}
            >
              {Object.entries(GROUP_FORMAT_LABEL).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="ch-gbo">Partidas da classificatória</Label>
            <Select id="ch-gbo" value={v.groupBestOf} onChange={(e) => set("groupBestOf", Number(e.target.value))}>
              <option value={1}>MD1</option>
              <option value={3}>MD3</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="ch-pw">Pontos por vitória</Label>
            <Input
              id="ch-pw"
              type="number"
              min={0}
              max={10}
              value={Number.isNaN(v.pointsWin) ? "" : v.pointsWin}
              onChange={(e) => set("pointsWin", num(e.target.value))}
            />
          </div>
          <div>
            <Label htmlFor="ch-pl">Pontos por derrota</Label>
            <Input
              id="ch-pl"
              type="number"
              min={0}
              max={10}
              value={Number.isNaN(v.pointsLoss) ? "" : v.pointsLoss}
              onChange={(e) => set("pointsLoss", num(e.target.value))}
            />
          </div>
          <div className="hidden sm:block" />
          <div className="sm:col-span-2">
            <Label htmlFor="ch-po">Playoffs</Label>
            <Select
              id="ch-po"
              value={v.playoffFormat}
              onChange={(e) => set("playoffFormat", e.target.value as PlayoffFormat)}
            >
              {Object.entries(PLAYOFF_FORMAT_LABEL).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="ch-pbo">Partidas dos playoffs</Label>
            <Select
              id="ch-pbo"
              value={v.playoffBestOf}
              disabled={v.playoffFormat === "none"}
              onChange={(e) => set("playoffBestOf", Number(e.target.value))}
            >
              <option value={1}>MD1</option>
              <option value={3}>MD3</option>
              <option value={5}>MD5</option>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Agenda dos jogos" description="Os capitães combinam a data dentro destes dias e horários." />
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-3">
            <Label>Dias permitidos</Label>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAYS_SHORT.map((d, i) => {
                const on = v.matchDays.includes(i);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      set("matchDays", on ? v.matchDays.filter((x) => x !== i) : [...v.matchDays, i].sort())
                    }
                    className={cn(
                      "h-8 rounded-md border px-3 text-sm transition-colors",
                      on
                        ? "border-brand bg-brand/12 font-semibold text-fg"
                        : "border-border text-muted hover:border-border-strong hover:text-fg",
                    )}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <Label htmlFor="ch-ws">Das</Label>
            <Input id="ch-ws" type="time" value={v.windowStart} onChange={(e) => set("windowStart", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="ch-we">Até</Label>
            <Input id="ch-we" type="time" value={v.windowEnd} onChange={(e) => set("windowEnd", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="ch-srv">Servidores simultâneos</Label>
            <Input
              id="ch-srv"
              type="number"
              min={1}
              max={10}
              value={Number.isNaN(v.servers) ? "" : v.servers}
              onChange={(e) => set("servers", num(e.target.value))}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          title="Inscrição e premiação"
          description="O pagamento é controlado fora do site; aqui só o cálculo da premiação."
        />
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="ch-fee">Inscrição por jogador (R$)</Label>
            <Input
              id="ch-fee"
              type="number"
              min={0}
              step="0.01"
              value={Number.isNaN(v.entryFee) ? "" : v.entryFee}
              onChange={(e) => set("entryFee", num(e.target.value))}
            />
          </div>
          <div>
            <Label htmlFor="ch-costs">Custos operacionais (R$)</Label>
            <Input
              id="ch-costs"
              type="number"
              min={0}
              step="0.01"
              value={Number.isNaN(v.costs) ? "" : v.costs}
              onChange={(e) => set("costs", num(e.target.value))}
            />
          </div>
          <div className="hidden sm:block" />
          <div className="sm:col-span-3">
            <Label>
              Percentual por colocação{" "}
              <span className={cn(Math.abs(splitSum - 100) > 0.01 ? "text-loss" : "text-subtle")}>
                (soma {splitSum.toLocaleString("pt-BR")}%)
              </span>
            </Label>
            <div className="flex flex-wrap items-center gap-2">
              {v.prizeSplit.map((p, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-muted">{i + 1}º</span>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step="0.5"
                    aria-label={`Percentual do ${i + 1}º lugar`}
                    className="w-20"
                    value={Number.isNaN(p) ? "" : p}
                    onChange={(e) =>
                      set(
                        "prizeSplit",
                        v.prizeSplit.map((x, j) => (j === i ? num(e.target.value) : x)),
                      )
                    }
                  />
                  <span className="text-xs text-muted">%</span>
                </div>
              ))}
              {v.prizeSplit.length < 8 && (
                <Button variant="ghost" size="sm" onClick={() => set("prizeSplit", [...v.prizeSplit, 0])}>
                  <Plus /> Colocação
                </Button>
              )}
              {v.prizeSplit.length > 1 && (
                <Button variant="ghost" size="sm" onClick={() => set("prizeSplit", v.prizeSplit.slice(0, -1))}>
                  <Trash2 /> Última
                </Button>
              )}
            </div>
          </div>
          {Number.isFinite(players) && players > 0 && (
            <p className="text-xs text-muted sm:col-span-3">
              Com {players} inscritos: arrecadação de {formatMoney(prize.collected)}
              {v.costs ? `, ${formatMoney(prize.pool)} depois dos custos` : ""} →{" "}
              {prize.prizes.map((p, i) => `${i + 1}º ${formatMoney(p)}`).join(" · ")}.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-end gap-3">
        {tried && errors.length > 0 && <p className="text-sm text-loss">{errors[0]}</p>}
        <Button type="submit" variant="primary" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          {id ? "Salvar alterações" : "Criar campeonato"}
        </Button>
      </div>
    </form>
  );
}
