"use client";

import { Copy, KeyRound, Link2, Loader2, LogIn, LogOut, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { joinTeamByCode, leaveTeam, regenerateTeamCode, setPlayerTeam } from "@/app/(app)/campeonatos/code-actions";
import { Button } from "../ui/button";
import { Input, Select } from "../ui/input";

type Result = { ok: boolean; message: string };

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<Result>, opts?: { confirm?: string; after?: () => void }) => {
    if (opts?.confirm && !confirm(opts.confirm)) return;
    start(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(r.message);
        opts?.after?.();
      } else toast.error(r.message);
      router.refresh();
    });
  };
  return [pending, run] as const;
}

/**
 * Entrar no time com o código. Com `auto` (link de convite com o código), entra
 * sozinho ao abrir a página, uma vez, e limpa o código do endereço.
 */
export function JoinByCode({
  championshipId,
  initial = "",
  auto = false,
}: {
  championshipId: string;
  initial?: string;
  auto?: boolean;
}) {
  const [code, setCode] = useState(initial.toUpperCase());
  const [pending, run] = useRun();
  const router = useRouter();
  const tried = useRef(false);
  useEffect(() => {
    if (!auto || tried.current || initial.replace(/[^A-Z0-9]/gi, "").length < 6) return;
    tried.current = true;
    run(() => joinTeamByCode(championshipId, initial), {
      after: () => router.replace(window.location.pathname),
    });
  }, [auto, initial, championshipId, run, router]);
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => joinTeamByCode(championshipId, code));
      }}
    >
      <div className="relative">
        <KeyRound className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
        <Input
          aria-label="Código do time"
          placeholder="CÓDIGO"
          maxLength={8}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          className="w-44 pl-9 font-display tracking-[0.3em] uppercase"
        />
      </div>
      <Button type="submit" variant="primary" disabled={pending || code.replace(/[^A-Z0-9]/gi, "").length < 6}>
        {pending ? <Loader2 className="animate-spin" /> : <LogIn />} {pending ? "Entrando…" : "Entrar no time"}
      </Button>
    </form>
  );
}

/** Sair do próprio time (antes do campeonato começar). */
export function LeaveTeam({ championshipId, teamName }: { championshipId: string; teamName: string }) {
  const [pending, run] = useRun();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() =>
        run(() => leaveTeam(championshipId), {
          confirm: `Sair do ${teamName}? Você deixa o campeonato (pode entrar de novo com o código).`,
        })
      }
    >
      <LogOut /> Sair do time
    </Button>
  );
}

/** Código do time para a organização e o capitão: copiar o código, copiar o link e gerar outro. */
export function TeamCode({
  championshipId,
  teamId,
  code,
  slug,
  canRegenerate,
}: {
  championshipId: string;
  teamId: string;
  code: string;
  slug: string;
  canRegenerate: boolean;
}) {
  const [pending, run] = useRun();
  const copy = (text: string, msg: string) =>
    navigator.clipboard
      .writeText(text)
      .then(() => toast.success(msg))
      .catch(() => toast.error("Não foi possível copiar."));
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-t border-border bg-surface-2/40 px-4 py-2">
      <span className="text-[11px] text-muted">Código</span>
      <span className="font-display text-sm font-bold tracking-[0.25em] text-brand">{code}</span>
      <div className="ml-auto flex">
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
          title="Copiar link de convite"
          onClick={() =>
            copy(
              `${window.location.origin}/campeonatos/${slug}/equipes?codigo=${code}`,
              "Link de convite copiado: quem abrir (logado) já entra no time.",
            )
          }
        >
          <Link2 />
        </Button>
        {canRegenerate && (
          <Button
            variant="ghost"
            size="sm"
            className="px-2"
            title="Gerar outro código"
            disabled={pending}
            onClick={() =>
              run(() => regenerateTeamCode(championshipId, teamId), {
                confirm: "Gerar outro código? O atual deixa de valer (quem já entrou continua no time).",
              })
            }
          >
            {pending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          </Button>
        )}
      </div>
    </div>
  );
}

/** Organização: em qual time está o inscrito. */
export function PlayerTeamSelect({
  championshipId,
  userId,
  name,
  teamId,
  teams,
}: {
  championshipId: string;
  userId: string;
  name: string;
  teamId: string | null;
  teams: { id: string; name: string }[];
}) {
  const [pending, run] = useRun();
  return (
    <Select
      aria-label={`Time de ${name}`}
      className="h-8 w-32 text-xs"
      value={teamId ?? ""}
      disabled={pending}
      onChange={(e) => run(() => setPlayerTeam(championshipId, userId, e.target.value || null))}
    >
      <option value="">Sem time</option>
      {teams.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </Select>
  );
}
