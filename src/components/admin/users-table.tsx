"use client";

import { Loader2, ShieldMinus, ShieldPlus } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { setGcLevel, setUserRole } from "@/app/(app)/admin/actions";
import { formatDate } from "@/lib/format";
import type { ManagedUser } from "@/services/admin-users";
import { LevelBadge } from "../players/level-badge";
import { Avatar } from "../ui/avatar";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Table, TD, TH, THead, TR } from "../ui/table";

export function UsersTable({ users }: { users: ManagedUser[] }) {
  return (
    <Table>
      <THead>
        <TR>
          <TH className="min-w-56">Usuário</TH>
          <TH>ELO</TH>
          <TH title="Define o ELO inicial enquanto o jogador não tiver partidas">Nível GC</TH>
          <TH>Cadastro</TH>
          <TH>E-mail</TH>
          <TH>Papel</TH>
          <TH className="text-right">Ação</TH>
        </TR>
      </THead>
      <tbody>
        {users.map((u) => (
          <TR key={u.id}>
            <TD>
              <div className="flex items-center gap-2.5">
                <Avatar name={u.displayName} size="sm" />
                <div className="min-w-0">
                  <div className="font-medium">{u.displayName}</div>
                  <div className="text-xs text-muted">
                    {u.fullName ? `${u.fullName} · ` : ""}
                    {u.email}
                  </div>
                </div>
              </div>
            </TD>
            <TD>
              <div className="flex items-center gap-1.5">
                <LevelBadge elo={u.elo} />
                <span className="font-semibold tabular">{u.elo}</span>
              </div>
            </TD>
            <TD>
              <GcLevelSelect user={u} />
            </TD>
            <TD className="text-muted">{formatDate(u.createdAt)}</TD>
            <TD>
              {u.emailConfirmed ? <Badge variant="win">Confirmado</Badge> : <Badge variant="neutral">Pendente</Badge>}
            </TD>
            <TD>
              {u.isSuperAdmin ? (
                <Badge variant="brand">Super admin</Badge>
              ) : u.role === "admin" ? (
                <Badge variant="brand">Administrador</Badge>
              ) : (
                <span className="text-sm text-muted">Jogador</span>
              )}
            </TD>
            <TD className="text-right">{!u.isSuperAdmin && <RoleButton user={u} />}</TD>
          </TR>
        ))}
      </tbody>
    </Table>
  );
}

function RoleButton({ user }: { user: ManagedUser }) {
  const [pending, start] = useTransition();
  const promote = user.role !== "admin";
  return (
    <Button
      size="sm"
      variant={promote ? "outline" : "ghost"}
      disabled={pending || (promote && !user.emailConfirmed)}
      title={promote && !user.emailConfirmed ? "O usuário precisa confirmar o e-mail primeiro" : undefined}
      onClick={() =>
        start(async () => {
          const result = await setUserRole(user.id, promote ? "admin" : "user");
          if (result.ok) toast.success(result.message);
          else toast.error(result.message);
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : promote ? <ShieldPlus /> : <ShieldMinus />}
      {promote ? "Tornar admin" : "Remover admin"}
    </Button>
  );
}

function GcLevelSelect({ user }: { user: ManagedUser }) {
  const [pending, start] = useTransition();
  if (user.mixesPlayed > 0) {
    return (
      <span className="text-xs text-subtle" title="Já tem partidas: o ELO vem dos mixes">
        {user.gcLevel ?? "—"}
      </span>
    );
  }
  return (
    <select
      aria-label={`Nível GC de ${user.displayName}`}
      value={user.gcLevel ?? ""}
      disabled={pending}
      onChange={(e) =>
        start(async () => {
          const r = await setGcLevel(user.id, Number(e.target.value));
          if (r.ok) toast.success(r.message);
          else toast.error(r.message);
        })
      }
      className="h-8 rounded-md border border-border bg-surface-2 px-2 text-sm"
    >
      <option value="" disabled>
        —
      </option>
      {Array.from({ length: 21 }, (_, gc) => (
        <option key={gc} value={gc}>
          {gc}
        </option>
      ))}
    </select>
  );
}
