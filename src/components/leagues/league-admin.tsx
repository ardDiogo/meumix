"use client";

import { Copy, KeyRound, Link2, Loader2, RefreshCw, ShieldCheck, ShieldOff, UserMinus, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { leagueInvite, regenerateLeagueCode, setLeagueAdmin, setLeagueMember } from "@/app/(app)/liga/actions";
import type { LeagueMemberView } from "@/services/league";
import { Avatar } from "../ui/avatar";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Select } from "../ui/input";

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

/** Código e link de convite da liga atual. */
export function LeagueInvite({ leagueName }: { leagueName: string }) {
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  useEffect(() => {
    leagueInvite().then((r) => (r.ok ? setCode(r.code ?? null) : setError(r.message)));
  }, []);
  const link = code ? `${window.location.origin}/liga/entrar?codigo=${code}` : "";
  if (error) return <p className="text-sm text-loss">{error}</p>;
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        Mande o link para quem vai jogar no {leagueName}: quem abrir (logado) já entra na liga. Quem ainda não tem conta
        cria uma e volta para o convite.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex h-10 items-center gap-2 rounded-md border border-border bg-surface-2/60 px-3">
          <KeyRound className="size-4 text-subtle" />
          <span className="font-display text-lg font-bold tracking-[0.3em] text-brand">{code ?? "······"}</span>
        </span>
        <Button variant="primary" size="sm" disabled={!code} onClick={() => copy(link, "Link de convite copiado.")}>
          <Link2 /> Copiar link
        </Button>
        <Button variant="outline" size="sm" disabled={!code} onClick={() => copy(code!, "Código copiado.")}>
          <Copy /> Copiar código
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={!code || pending}
          title="Gerar outro código"
          onClick={() => {
            if (!confirm("Gerar outro código? O atual deixa de valer (quem já entrou continua na liga).")) return;
            start(async () => {
              const r = await regenerateLeagueCode();
              if (r.ok) {
                setCode(r.code ?? null);
                toast.success(r.message);
              } else toast.error(r.message);
            });
          }}
        >
          {pending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Gerar outro
        </Button>
      </div>
    </div>
  );
}

/** Membros da liga: admins, remover e adicionar. */
export function LeagueMembers({
  leagueName,
  members,
  others,
  viewerId,
}: {
  leagueName: string;
  members: LeagueMemberView[];
  others: { id: string; name: string }[];
  viewerId: string;
}) {
  const [pending, run] = useRun();
  const [adding, setAdding] = useState("");
  return (
    <div className="space-y-3">
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (adding) run(() => setLeagueMember(adding, true));
          setAdding("");
        }}
      >
        <Select
          aria-label="Jogador para adicionar"
          className="h-9 w-56"
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
        >
          <option value="">Adicionar jogador…</option>
          {others.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </Select>
        <Button type="submit" size="sm" variant="outline" disabled={!adding || pending}>
          <UserPlus /> Adicionar
        </Button>
      </form>
      <ul className="divide-y divide-border rounded-md border border-border">
        {members.map((m) => (
          <li key={m.userId} className="flex items-center gap-3 px-3 py-2">
            <Avatar name={m.name} src={m.avatarUrl} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">
                {m.name} {m.role === "admin" && <Badge variant="brand">Admin da liga</Badge>}
              </div>
              <div className="text-xs text-muted">ELO {m.elo}</div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="px-2"
              disabled={pending}
              title={m.role === "admin" ? "Tirar admin da liga" : "Tornar admin da liga"}
              aria-label={`${m.role === "admin" ? "Tirar admin" : "Tornar admin"}: ${m.name}`}
              onClick={() =>
                run(
                  () => setLeagueAdmin(m.userId, m.role !== "admin"),
                  m.role === "admin"
                    ? `Tirar ${m.name} da administração do ${leagueName}?`
                    : `Tornar ${m.name} admin do ${leagueName}? Ele poderá criar, finalizar e excluir mixes desta liga e gerenciar os membros.`,
                )
              }
            >
              {m.role === "admin" ? <ShieldOff /> : <ShieldCheck />}
            </Button>
            {m.userId !== viewerId && (
              <Button
                variant="ghost"
                size="sm"
                className="px-2 text-loss"
                disabled={pending}
                title="Remover da liga"
                aria-label={`Remover ${m.name} da liga`}
                onClick={() =>
                  run(
                    () => setLeagueMember(m.userId, false),
                    `Remover ${m.name} do ${leagueName}? O histórico e o ELO dele ficam guardados; ele volta se entrar de novo pelo convite.`,
                  )
                }
              >
                <UserMinus />
              </Button>
            )}
          </li>
        ))}
      </ul>
      <p className="text-xs text-subtle">{members.length} membros.</p>
    </div>
  );
}
