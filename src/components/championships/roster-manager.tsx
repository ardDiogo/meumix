"use client";

import { ImagePlus, Loader2, Pencil, Plus, Search, Trash2, UserMinus, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { addPlayers, deleteTeam, removePlayer, saveTeam } from "@/app/(app)/campeonatos/team-actions";
import { suggestTag, TEAM_COLORS, validateTeam, type ChampionshipTeam, type TeamInput } from "@/lib/championship";
import { compressImage } from "@/lib/image-client";
import { cn } from "@/lib/utils";
import { Avatar } from "../ui/avatar";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogTrigger } from "../ui/dialog";
import { Input, Label, Select } from "../ui/input";
import { TeamLogo } from "./team-logo";

export type Person = { id: string; nickname: string; avatarUrl: string | null };
type Result = { ok: boolean; message: string };

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<Result>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(r.message);
      toast.success(r.message);
      after?.();
      router.refresh();
    });
  return [pending, run] as const;
}

/** Inscrever jogadores cadastrados: busca e marca vários de uma vez. */
export function AddPlayersDialog({
  championshipId,
  candidates,
  vagas,
}: {
  championshipId: string;
  candidates: Person[];
  vagas: number;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [pending, run] = useRun();
  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return candidates
      .filter((p) => !term || p.nickname.toLowerCase().includes(term))
      .sort((a, b) => a.nickname.localeCompare(b.nickname, "pt-BR"));
  }, [candidates, q]);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setPicked([]);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="primary" size="sm" disabled={vagas <= 0}>
          <UserPlus /> Inscrever jogadores
        </Button>
      </DialogTrigger>
      <DialogContent title="Inscrever jogadores" description={`Jogadores cadastrados no MeuMix · ${vagas} vagas`}>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar pelo nick"
            className="pl-9"
            aria-label="Buscar jogador"
          />
        </div>
        <ul className="mt-3 max-h-72 divide-y divide-border overflow-y-auto rounded-md border border-border">
          {list.map((p) => {
            const on = picked.includes(p.id);
            return (
              <li key={p.id}>
                <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm hover:bg-surface-2">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggle(p.id)}
                    disabled={!on && picked.length >= vagas}
                    className="size-4 accent-[var(--color-brand)]"
                  />
                  <Avatar name={p.nickname} src={p.avatarUrl} size="xs" />
                  <span className="truncate">{p.nickname}</span>
                </label>
              </li>
            );
          })}
          {!list.length && <li className="px-3 py-6 text-center text-sm text-muted">Ninguém encontrado.</li>}
        </ul>
        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="text-xs text-muted">
            {picked.length} de {vagas} vagas
          </span>
          <Button
            variant="primary"
            disabled={!picked.length || pending}
            onClick={() =>
              run(
                () => addPlayers(championshipId, picked),
                () => {
                  setOpen(false);
                  setPicked([]);
                },
              )
            }
          >
            {pending && <Loader2 className="animate-spin" />} Inscrever {picked.length || ""}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Botão de tirar um inscrito. */
export function RemovePlayerButton({
  championshipId,
  userId,
  name,
}: {
  championshipId: string;
  userId: string;
  name: string;
}) {
  const [pending, run] = useRun();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="px-2 text-muted hover:text-loss"
      aria-label={`Remover ${name}`}
      title="Remover inscrição"
      disabled={pending}
      onClick={() => confirm(`Remover a inscrição de ${name}?`) && run(() => removePlayer(championshipId, userId))}
    >
      {pending ? <Loader2 className="animate-spin" /> : <UserMinus />}
    </Button>
  );
}

/** Criar ou editar um time: nome, sigla, cor, escudo e capitão. */
export function TeamDialog({
  championshipId,
  team,
  captainOptions,
  logoVersion,
}: {
  championshipId: string;
  team?: ChampionshipTeam;
  /** Inscritos que podem ser capitão deste time (sem time, ou o capitão atual). */
  captainOptions: Person[];
  logoVersion?: string;
}) {
  const [open, setOpen] = useState(false);
  const blank: TeamInput = { name: "", tag: "", color: TEAM_COLORS[0]!, captainId: null };
  const [v, setV] = useState<TeamInput>(
    team ? { name: team.name, tag: team.tag, color: team.color, captainId: team.captainId } : blank,
  );
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [tagTouched, setTagTouched] = useState(!!team?.tag);
  const [pending, run] = useRun();
  const errors = validateTeam(v);
  const showLogo =
    logoPreview ??
    (team?.hasLogo && v.logo !== null ? `/api/campeonatos/times/${team.id}/logo?v=${logoVersion ?? ""}` : null);

  const pickLogo = async (file?: File) => {
    if (!file) return;
    try {
      const img = await compressImage(file, 256);
      setV((o) => ({ ...o, logo: img.data }));
      setLogoPreview(`data:${img.mimeType};base64,${img.data}`);
    } catch {
      toast.error("Não foi possível ler a imagem.");
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o && !team) {
          setV(blank);
          setLogoPreview(null);
          setTagTouched(false);
        }
      }}
    >
      <DialogTrigger asChild>
        {team ? (
          <Button variant="ghost" size="sm" className="px-2" aria-label={`Editar ${team.name}`} title="Editar time">
            <Pencil />
          </Button>
        ) : (
          <Button variant="outline" size="sm">
            <Plus /> Novo time
          </Button>
        )}
      </DialogTrigger>
      <DialogContent title={team ? `Editar ${team.name}` : "Novo time"}>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (errors.length) return void toast.error(errors[0]);
            run(
              () => saveTeam(championshipId, team?.id ?? null, v),
              () => setOpen(false),
            );
          }}
        >
          <div className="grid grid-cols-[1fr_6rem] gap-3">
            <div>
              <Label htmlFor="team-name">Nome</Label>
              <Input
                id="team-name"
                value={v.name}
                maxLength={40}
                placeholder="Time Snkk"
                onChange={(e) =>
                  setV((o) => ({ ...o, name: e.target.value, tag: tagTouched ? o.tag : suggestTag(e.target.value) }))
                }
              />
            </div>
            <div>
              <Label htmlFor="team-tag">Sigla</Label>
              <Input
                id="team-tag"
                value={v.tag}
                maxLength={5}
                onChange={(e) => {
                  setTagTouched(true);
                  setV((o) => ({ ...o, tag: e.target.value.toUpperCase() }));
                }}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="team-captain">Capitão</Label>
            <Select
              id="team-captain"
              value={v.captainId ?? ""}
              onChange={(e) => setV((o) => ({ ...o, captainId: e.target.value || null }))}
            >
              <option value="">Sem capitão por enquanto</option>
              {captainOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nickname}
                </option>
              ))}
            </Select>
            <p className="mt-1 text-xs text-subtle">O capitão é inscrito, lidera o time e é um dos jogadores.</p>
          </div>
          <div>
            <Label>Cor</Label>
            <div className="flex flex-wrap items-center gap-1.5">
              {TEAM_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Cor ${c}`}
                  aria-pressed={v.color.toUpperCase() === c}
                  onClick={() => setV((o) => ({ ...o, color: c }))}
                  className={cn(
                    "size-7 rounded-md border-2 transition-transform",
                    v.color.toUpperCase() === c ? "scale-110 border-fg" : "border-transparent",
                  )}
                  style={{ background: c }}
                />
              ))}
              <input
                type="color"
                aria-label="Outra cor"
                value={v.color}
                onChange={(e) => setV((o) => ({ ...o, color: e.target.value.toUpperCase() }))}
                className="size-7 cursor-pointer rounded-md border border-border bg-transparent"
              />
            </div>
          </div>
          <div>
            <Label>Escudo</Label>
            <div className="flex items-center gap-3">
              {showLogo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={showLogo} alt="" className="size-12 rounded-lg border border-border object-cover" />
              ) : (
                <TeamLogo
                  team={{ id: "x", name: v.name || "?", tag: v.tag, color: v.color, hasLogo: false }}
                  size={48}
                />
              )}
              <Button variant="outline" size="sm" asChild>
                <label className="cursor-pointer">
                  <ImagePlus /> {showLogo ? "Trocar" : "Enviar imagem"}
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => pickLogo(e.target.files?.[0])}
                  />
                </label>
              </Button>
              {showLogo && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setV((o) => ({ ...o, logo: null }));
                    setLogoPreview(null);
                  }}
                >
                  <Trash2 /> Remover
                </Button>
              )}
            </div>
          </div>
          <div className="flex justify-end pt-1">
            <Button type="submit" variant="primary" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />} {team ? "Salvar" : "Criar time"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Excluir time, com confirmação. */
export function DeleteTeamButton({ championshipId, team }: { championshipId: string; team: ChampionshipTeam }) {
  const [pending, run] = useRun();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="px-2 text-muted hover:text-loss"
      aria-label={`Excluir ${team.name}`}
      title="Excluir time"
      disabled={pending}
      onClick={() =>
        confirm(`Excluir o ${team.name}? O capitão continua inscrito, só sem time.`) &&
        run(() => deleteTeam(championshipId, team.id))
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : <Trash2 />}
    </Button>
  );
}
