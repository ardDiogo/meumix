"use client";

import { Check, Copy, KeyRound, Link2, Loader2, Plus, Search, ShieldCheck, Trash2, Trophy } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  createLeague,
  deleteLeague,
  leagueInvite,
  regenerateLeagueCode,
  setLeagueAdmin,
  setLeagueMember,
} from "@/app/(app)/liga/actions";
import { cn } from "@/lib/utils";
import type { CommunityLeague, CommunityPlayer } from "@/services/league";
import { Avatar } from "../ui/avatar";
import { Button } from "../ui/button";
import { Input, Select } from "../ui/input";

const WEEKDAY = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
type Result = { ok: boolean; message: string };

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<Result>, confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return;
    start(async () => {
      const r = await fn();
      if (r.ok) toast.success(r.message);
      else toast.error(r.message);
      router.refresh();
    });
  };
  return [pending, run] as const;
}

const copy = (text: string, msg: string) =>
  navigator.clipboard
    .writeText(text)
    .then(() => toast.success(msg))
    .catch(() => toast.error("Não foi possível copiar."));

/** Ligas do sistema: números, convite, excluir (vazia) e criar. */
export function CommunityLeagues({ leagues }: { leagues: CommunityLeague[] }) {
  const [pending, run] = useRun();
  const [name, setName] = useState("");
  const [day, setDay] = useState("");
  return (
    <div className="space-y-4">
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {leagues.map((l) => (
          <li key={l.id} className="rounded-lg border border-border bg-surface p-4">
            <div className="flex items-start gap-2">
              <Trophy className="mt-0.5 size-4 shrink-0 text-brand" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{l.name}</div>
                <div className="text-xs text-muted">{l.weekday != null ? WEEKDAY[l.weekday] : "Sem dia fixo"}</div>
              </div>
              {l.slug !== "principal" && l.mixes === 0 && l.schedules === 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="px-2 text-loss"
                  disabled={pending}
                  aria-label={`Excluir ${l.name}`}
                  title="Excluir liga (só ligas sem mixes)"
                  onClick={() => run(() => deleteLeague(l.id), `Excluir a liga ${l.name}? Os membros saem dela.`)}
                >
                  <Trash2 />
                </Button>
              )}
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
              {[
                ["Membros", l.members],
                ["Admins", l.admins],
                ["Mixes", l.mixes],
              ].map(([label, value]) => (
                <div key={label} className="rounded-md bg-surface-2/60 py-1.5">
                  <dt className="text-[10px] font-semibold tracking-wider text-muted uppercase">{label}</dt>
                  <dd className="font-display text-lg font-bold tabular">{value}</dd>
                </div>
              ))}
            </dl>
            <InviteRow leagueId={l.id} />
          </li>
        ))}
      </ul>
      <form
        className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border-strong p-3"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => createLeague(name, day === "" ? null : Number(day)));
          setName("");
          setDay("");
        }}
      >
        <span className="text-sm font-medium">Nova liga</span>
        <Input
          aria-label="Nome da nova liga"
          placeholder="Ex.: Mix de Quarta"
          maxLength={40}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-9 w-56"
        />
        <Select aria-label="Dia do mix" className="h-9 w-36" value={day} onChange={(e) => setDay(e.target.value)}>
          <option value="">Sem dia fixo</option>
          {WEEKDAY.map((d, i) => (
            <option key={d} value={i}>
              {d}
            </option>
          ))}
        </Select>
        <Button type="submit" size="sm" variant="primary" disabled={pending || name.trim().length < 3}>
          {pending ? <Loader2 className="animate-spin" /> : <Plus />} Criar liga
        </Button>
      </form>
    </div>
  );
}

/** Convite de uma liga: carrega o código ao pedir, copia o link e gera outro. */
function InviteRow({ leagueId }: { leagueId: string }) {
  const [code, setCode] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const load = (fn: () => Promise<Result & { code?: string }>) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        setCode(r.code ?? null);
        if (r.message) toast.success(r.message);
      } else toast.error(r.message);
    });
  const link = code ? `${window.location.origin}/liga/entrar?codigo=${code}` : "";
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
      {code ? (
        <>
          <span className="flex items-center gap-1.5 font-display text-sm font-bold tracking-[0.25em] text-brand">
            <KeyRound className="size-3.5 text-subtle" />
            {code}
          </span>
          <div className="ml-auto flex">
            <Button
              variant="ghost"
              size="sm"
              className="px-2"
              title="Copiar link"
              onClick={() => copy(link, "Link copiado.")}
            >
              <Link2 />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="px-2"
              title="Copiar código"
              onClick={() => copy(code, "Código copiado.")}
            >
              <Copy />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="px-2"
              disabled={pending}
              title="Gerar outro código"
              onClick={() =>
                confirm("Gerar outro código? O atual deixa de valer.") && load(() => regenerateLeagueCode(leagueId))
              }
            >
              {pending ? <Loader2 className="animate-spin" /> : "↻"}
            </Button>
          </div>
        </>
      ) : (
        <Button variant="outline" size="sm" disabled={pending} onClick={() => load(() => leagueInvite(leagueId))}>
          {pending ? <Loader2 className="animate-spin" /> : <KeyRound />} Ver convite
        </Button>
      )}
    </div>
  );
}

/** Jogadores cadastrados × ligas: incluir, remover e tornar admin. */
export function CommunityPlayers({
  leagues,
  players,
  viewerId,
}: {
  leagues: CommunityLeague[];
  players: CommunityPlayer[];
  viewerId: string;
}) {
  const [pending, run] = useRun();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("todos");
  const norm = (s: string) =>
    s
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase();
  const list = useMemo(
    () =>
      players.filter(
        (p) =>
          norm(p.name).includes(norm(query.trim())) &&
          (filter === "todos" || (filter === "sem-liga" ? Object.keys(p.leagues).length === 0 : filter in p.leagues)),
      ),
    [players, query, filter],
  );
  const noLeague = players.filter((p) => Object.keys(p.leagues).length === 0).length;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
          <Input
            aria-label="Buscar jogador"
            placeholder="Buscar jogador…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-9 w-56 pl-9"
          />
        </div>
        <Select aria-label="Filtrar" className="h-9 w-48" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="todos">Todos ({players.length})</option>
          {leagues.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name} ({l.members})
            </option>
          ))}
          <option value="sem-liga">Sem liga ({noLeague})</option>
        </Select>
      </div>
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-max text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-2/40 text-left text-[11px] font-semibold tracking-wider text-muted uppercase">
              <th className="px-3 py-2">Jogador</th>
              {leagues.map((l) => (
                <th key={l.id} className="px-3 py-2 text-center">
                  {l.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id} className="border-b border-border last:border-0">
                <td className="px-3 py-1.5">
                  <span className="flex items-center gap-2">
                    <Avatar name={p.name} src={p.avatarUrl} size="sm" />
                    <span className="max-w-40 truncate font-medium">{p.name}</span>
                  </span>
                </td>
                {leagues.map((l) => {
                  const role = p.leagues[l.id];
                  return (
                    <td key={l.id} className="px-3 py-1.5">
                      <span className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          disabled={pending}
                          aria-pressed={!!role}
                          aria-label={`${role ? "Remover" : "Incluir"} ${p.name} ${role ? "do" : "no"} ${l.name}`}
                          title={role ? "Membro: clique para remover" : "Clique para incluir"}
                          onClick={() =>
                            run(
                              () => setLeagueMember(p.id, !role, l.id),
                              role ? `Remover ${p.name} do ${l.name}? O histórico fica guardado.` : undefined,
                            )
                          }
                          className={cn(
                            "flex size-7 items-center justify-center rounded-md border transition-colors",
                            role
                              ? "border-win/50 bg-win/15 text-win hover:bg-win/25"
                              : "border-border text-subtle hover:border-border-strong hover:text-fg",
                          )}
                        >
                          {role ? <Check className="size-4" /> : <Plus className="size-3.5" />}
                        </button>
                        {role && (
                          <button
                            type="button"
                            disabled={pending || (p.id === viewerId && role === "admin")}
                            aria-pressed={role === "admin"}
                            aria-label={`${role === "admin" ? "Tirar admin" : "Tornar admin"}: ${p.name} no ${l.name}`}
                            title={role === "admin" ? "Admin da liga: clique para tirar" : "Tornar admin da liga"}
                            onClick={() => run(() => setLeagueAdmin(p.id, role !== "admin", l.id))}
                            className={cn(
                              "flex size-7 items-center justify-center rounded-md border transition-colors",
                              role === "admin"
                                ? "border-brand/60 bg-brand/15 text-brand"
                                : "border-border text-subtle hover:text-fg",
                            )}
                          >
                            <ShieldCheck className="size-3.5" />
                          </button>
                        )}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-subtle">
        ✓ = membro (vê a liga e se inscreve nos mixes dela) · escudo laranja = admin da liga. Quem sai da liga mantém o
        histórico e volta pelo convite.
      </p>
    </div>
  );
}
