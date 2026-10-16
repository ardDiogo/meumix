"use client";

import {
  ChevronDown,
  Copy,
  HelpCircle,
  KeyRound,
  Loader2,
  Pencil,
  ShieldMinus,
  ShieldPlus,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setUserRole } from "@/app/(app)/admin/actions";
import {
  deleteUser,
  resetUserPassword,
  suggestPassword,
  updateUserData,
  updateUserElo,
} from "@/app/(app)/admin/user-actions";
import { formatDate } from "@/lib/format";
import { ELO_CAP, initialEloFromGc, levelForElo } from "@/lib/levels";
import { cn } from "@/lib/utils";
import type { ManagedUser } from "@/services/admin-users";
import { LevelBadge } from "../players/level-badge";
import { useLevels } from "../players/levels-context";
import { Avatar } from "../ui/avatar";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Dialog, DialogClose, DialogContent } from "../ui/dialog";
import { Input, Label, Select } from "../ui/input";
import { Table, TD, TH, THead, TR } from "../ui/table";

type Action = "edit" | "elo" | "password" | "role" | "delete";

/**
 * Gerenciamento de usuários (admin): editar dados e Steam, ELO, senha,
 * papel (só o master) e exclusão. O servidor confere a hierarquia de novo.
 */
export function UsersTable({
  users,
  canManageAdmins,
  currentUserId,
}: {
  users: ManagedUser[];
  canManageAdmins: boolean;
  currentUserId: string;
}) {
  const [open, setOpen] = useState<{ action: Action; user: ManagedUser } | null>(null);
  const close = () => setOpen(null);

  return (
    <>
      <div className="overflow-x-auto">
        <Table>
          <THead>
            <TR>
              <TH className="min-w-56">Usuário</TH>
              <TH>ELO</TH>
              <TH>Steam</TH>
              <TH>Cadastro</TH>
              <TH>Papel</TH>
              <TH className="text-right">Ações</TH>
            </TR>
          </THead>
          <tbody>
            {users.map((u) => {
              const self = u.id === currentUserId;
              // Admins gerenciam jogadores; só o master mexe em administradores; o master só em si mesmo.
              const manageable = self || (!u.isSuperAdmin && (u.role !== "admin" || canManageAdmins));
              const act = (action: Action) => () => setOpen({ action, user: u });
              return (
                <TR key={u.id}>
                  <TD>
                    <div className="flex items-center gap-2.5">
                      <Avatar name={u.displayName} src={u.avatarUrl} size="sm" />
                      <div className="min-w-0">
                        <div className="font-medium">{u.displayName}</div>
                        <div className="truncate text-xs text-muted">
                          {u.fullName ? `${u.fullName} · ` : ""}
                          {u.email}
                          {!u.emailConfirmed && <span className="ml-1 text-loss">(não confirmado)</span>}
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
                    {u.steamUrl ? (
                      <a
                        href={u.steamUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-muted hover:text-brand"
                      >
                        Perfil ↗
                      </a>
                    ) : (
                      <span className="text-xs text-subtle">—</span>
                    )}
                  </TD>
                  <TD className="text-muted">{formatDate(u.createdAt)}</TD>
                  <TD>
                    {u.isSuperAdmin ? (
                      <Badge variant="brand">Super admin</Badge>
                    ) : u.role === "admin" ? (
                      <Badge variant="brand">Administrador</Badge>
                    ) : (
                      <span className="text-sm text-muted">Jogador</span>
                    )}
                  </TD>
                  <TD>
                    {manageable && (
                      <div className="flex justify-end gap-1.5">
                        <IconButton label="Editar dados e Steam" onClick={act("edit")}>
                          <Pencil />
                        </IconButton>
                        <IconButton label="Editar nível e ELO" onClick={act("elo")}>
                          <TrendingUp />
                        </IconButton>
                        <IconButton label="Resetar senha" onClick={act("password")}>
                          <KeyRound />
                        </IconButton>
                        {canManageAdmins && !u.isSuperAdmin && (
                          <IconButton
                            label={u.role === "admin" ? "Remover administrador" : "Tornar administrador"}
                            onClick={act("role")}
                            className={
                              u.role === "admin"
                                ? "border-brand/40 bg-brand/15 text-brand hover:bg-brand/25"
                                : "border-win/40 bg-win/15 text-win hover:bg-win/25"
                            }
                          >
                            {u.role === "admin" ? <ShieldMinus /> : <ShieldPlus />}
                          </IconButton>
                        )}
                        {!self && !u.isSuperAdmin && (
                          <IconButton
                            label="Excluir usuário"
                            onClick={act("delete")}
                            className="border-loss/40 bg-loss/15 text-loss hover:bg-loss/25"
                          >
                            <Trash2 />
                          </IconButton>
                        )}
                      </div>
                    )}
                  </TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
      </div>

      <Dialog open={!!open} onOpenChange={(o) => !o && close()}>
        {open?.action === "edit" && <EditDialog user={open.user} onDone={close} />}
        {open?.action === "elo" && <EloDialog user={open.user} onDone={close} />}
        {open?.action === "password" && <PasswordDialog user={open.user} onDone={close} />}
        {open?.action === "role" && <RoleDialog user={open.user} onDone={close} />}
        {open?.action === "delete" && <DeleteDialog user={open.user} onDone={close} />}
      </Dialog>
    </>
  );
}

function IconButton({
  label,
  onClick,
  className,
  children,
}: {
  label: string;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-md border border-border text-muted transition-colors hover:border-border-strong hover:text-fg [&_svg]:size-4",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Rodapé padrão: Cancelar + ação. */
function Footer({
  pending,
  label,
  onConfirm,
  disabled,
  danger,
}: {
  pending: boolean;
  label: string;
  onConfirm: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <div className="mt-5 flex justify-end gap-2">
      <DialogClose asChild>
        <Button variant="secondary" disabled={pending}>
          Cancelar
        </Button>
      </DialogClose>
      <Button variant={danger ? "danger" : "primary"} disabled={pending || disabled} onClick={onConfirm}>
        {pending && <Loader2 className="animate-spin" />} {label}
      </Button>
    </div>
  );
}

function useAction(onDone: () => void) {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; message: string }>) =>
    start(async () => {
      let r: { ok: boolean; message: string };
      try {
        r = await fn();
      } catch {
        r = { ok: false, message: "Erro inesperado. Tente de novo." };
      }
      if (r.ok) {
        toast.success(r.message);
        onDone();
      } else toast.error(r.message);
    });
  return [pending, run] as const;
}

function EditDialog({ user, onDone }: { user: ManagedUser; onDone: () => void }) {
  const [pending, run] = useAction(onDone);
  const [form, setForm] = useState({
    nick: user.displayName,
    fullName: user.fullName ?? "",
    email: user.email,
    steam: user.steamUrl ?? "",
  });
  const field = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value })),
  });
  return (
    <DialogContent title="Editar usuário" description="Atualize as informações do usuário.">
      <div className="space-y-3">
        <div>
          <Label htmlFor="edit-nick">Nick</Label>
          <Input id="edit-nick" maxLength={24} {...field("nick")} />
        </div>
        <div>
          <Label htmlFor="edit-name">Nome</Label>
          <Input id="edit-name" maxLength={80} {...field("fullName")} />
        </div>
        <div>
          <Label htmlFor="edit-email">E-mail</Label>
          <Input id="edit-email" type="email" disabled={user.isSuperAdmin} {...field("email")} />
        </div>
        <div>
          <Label htmlFor="edit-steam">Link do perfil Steam</Label>
          <div className="flex items-center gap-2">
            <Avatar name={user.displayName} src={user.avatarUrl} size="sm" />
            <Input id="edit-steam" placeholder="https://steamcommunity.com/id/nick" {...field("steam")} />
          </div>
          <p className="mt-1.5 text-xs text-subtle">A foto é importada da Steam ao salvar. Deixe vazio para remover.</p>
        </div>
      </div>
      <Footer pending={pending} label="Salvar alterações" onConfirm={() => run(() => updateUserData(user.id, form))} />
    </DialogContent>
  );
}

function EloDialog({ user, onDone }: { user: ManagedUser; onDone: () => void }) {
  const levels = useLevels();
  const [pending, run] = useAction(onDone);
  const [elo, setElo] = useState(user.elo);
  const [gc, setGc] = useState<number | null>(null);
  const [help, setHelp] = useState(false);
  const current = levelForElo(user.elo, levels);
  const next = levelForElo(elo, levels);
  const valid = Number.isInteger(elo) && elo >= 0 && elo <= ELO_CAP;

  return (
    <DialogContent
      title="Editar nível e ELO"
      description={`Ajuste o nível e o ELO de ${user.displayName}.`}
    >
      <div className="space-y-4">
        <div>
          <Label htmlFor="elo-level">Nível</Label>
          <Select
            id="elo-level"
            value={next.level}
            onChange={(e) => {
              const l = levels.find((x) => x.level === Number(e.target.value));
              if (l) setElo(l.min);
            }}
          >
            {levels.map((l) => (
              <option key={l.level} value={l.level}>
                Nível {l.level} ({l.min} – {l.max} ELO)
              </option>
            ))}
          </Select>
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between text-sm">
            <Label htmlFor="elo-value" className="mb-0">
              ELO
            </Label>
            <span className="text-xs text-muted tabular">
              Faixa: {next.min} – {next.max}
            </span>
          </div>
          <input
            type="range"
            aria-label="ELO dentro da faixa do nível"
            min={next.min}
            max={next.max}
            value={Math.min(Math.max(elo, next.min), next.max)}
            onChange={(e) => setElo(Number(e.target.value))}
            className="w-full accent-brand"
          />
          <div className="mt-2 flex items-center gap-2">
            <Input
              id="elo-value"
              type="number"
              inputMode="numeric"
              min={0}
              max={ELO_CAP}
              value={Number.isNaN(elo) ? "" : elo}
              onChange={(e) => setElo(e.target.value === "" ? NaN : Math.round(Number(e.target.value)))}
              className="w-28 tabular"
            />
            <span className="text-sm text-muted">ELO</span>
          </div>
        </div>

        <div className="border-t border-border pt-3">
          <button
            type="button"
            onClick={() => setHelp((h) => !h)}
            className="flex w-full items-center justify-between text-sm font-medium"
            aria-expanded={help}
          >
            <span className="flex items-center gap-2">
              <HelpCircle className="size-4 text-muted" /> Ajuda: converter do nível GC
            </span>
            <span className="flex items-center gap-1 text-xs text-muted">
              {help ? "Ocultar" : "Mostrar"} <ChevronDown className={cn("size-3.5", help && "rotate-180")} />
            </span>
          </button>
          {help && (
            <div className="mt-3 flex items-center gap-2">
              <Select
                aria-label="Nível na Gamers Club"
                value={gc ?? ""}
                onChange={(e) => {
                  const g = Number(e.target.value);
                  setGc(g);
                  setElo(initialEloFromGc(g));
                }}
                className="w-40"
              >
                <option value="" disabled>
                  Nível GC…
                </option>
                {Array.from({ length: 21 }, (_, g) => (
                  <option key={g} value={g}>
                    GC {g}
                  </option>
                ))}
              </Select>
              <span className="text-xs text-muted">
                {gc != null ? `GC ${gc} → ${initialEloFromGc(gc)} ELO` : "Escolha o nível da GC do jogador."}
              </span>
            </div>
          )}
        </div>

        <div className="rounded-md bg-surface-2 px-3 py-2 text-sm">
          <div>
            Valores atuais:{" "}
            <span className="font-semibold">
              Nível {current.level} | {user.elo} ELO
            </span>
          </div>
          <div>
            Novos valores:{" "}
            <span className="font-semibold text-brand">
              {valid ? `Nível ${next.level} | ${elo} ELO` : `ELO de 0 a ${ELO_CAP}`}
            </span>
          </div>
          {user.mixesPlayed > 0 && (
            <p className="mt-1 text-xs text-subtle">
              Este jogador já tem partidas; o ajuste fica registrado no histórico de ELO.
            </p>
          )}
        </div>
      </div>
      <Footer
        pending={pending}
        label="Salvar alterações"
        disabled={!valid || (elo === user.elo && gc == null)}
        onConfirm={() => run(() => updateUserElo(user.id, elo, gc))}
      />
    </DialogContent>
  );
}

function PasswordDialog({ user, onDone }: { user: ManagedUser; onDone: () => void }) {
  const [pending, run] = useAction(onDone);
  const [password, setPassword] = useState("");
  const [generating, startGen] = useTransition();
  return (
    <DialogContent title="Resetar senha do usuário">
      <p className="text-sm text-muted">
        A senha de <span className="font-semibold text-fg">{user.displayName}</span> será trocada pela senha abaixo.
        Envie a nova senha ao jogador em particular; ele pode trocá-la em “Alterar senha”, no menu do usuário.
      </p>
      <div className="mt-4">
        <Label htmlFor="reset-password">Nova senha (mín. 8 caracteres)</Label>
        <div className="flex gap-2">
          <Input
            id="reset-password"
            value={password}
            autoComplete="off"
            onChange={(e) => setPassword(e.target.value)}
            className="font-mono"
          />
          <Button
            variant="secondary"
            disabled={generating}
            onClick={() => startGen(async () => setPassword(await suggestPassword()))}
          >
            Gerar
          </Button>
          <Button
            variant="secondary"
            aria-label="Copiar senha"
            disabled={!password}
            onClick={() => {
              void navigator.clipboard?.writeText(password).then(() => toast.success("Senha copiada."));
            }}
          >
            <Copy />
          </Button>
        </div>
      </div>
      <Footer
        pending={pending}
        label="Sim, resetar senha"
        disabled={password.length < 8}
        onConfirm={() => run(() => resetUserPassword(user.id, password))}
      />
    </DialogContent>
  );
}

function RoleDialog({ user, onDone }: { user: ManagedUser; onDone: () => void }) {
  const [pending, run] = useAction(onDone);
  const promote = user.role !== "admin";
  return (
    <DialogContent title={promote ? "Tornar administrador" : "Remover administrador"}>
      <p className="text-sm text-muted">
        {promote ? (
          <>
            <span className="font-semibold text-fg">{user.displayName}</span> poderá criar e finalizar mixes, gerenciar
            mapas e jogadores.
          </>
        ) : (
          <>
            <span className="font-semibold text-fg">{user.displayName}</span> volta a ser jogador e perde o acesso ao
            painel administrativo.
          </>
        )}
      </p>
      {promote && !user.emailConfirmed && (
        <p className="mt-2 text-sm text-loss">O usuário precisa confirmar o e-mail primeiro.</p>
      )}
      <Footer
        pending={pending}
        label={promote ? "Tornar admin" : "Remover admin"}
        disabled={promote && !user.emailConfirmed}
        onConfirm={() => run(() => setUserRole(user.id, promote ? "admin" : "user"))}
      />
    </DialogContent>
  );
}

function DeleteDialog({ user, onDone }: { user: ManagedUser; onDone: () => void }) {
  const [pending, run] = useAction(onDone);
  const [confirmText, setConfirmText] = useState("");
  return (
    <DialogContent title="Excluir usuário">
      <p className="text-sm text-muted">
        A conta de <span className="font-semibold text-fg">{user.displayName}</span> ({user.email}) será excluída
        permanentemente, junto com inscrições, votos e punições. As partidas já jogadas continuam no histórico com o
        nick dele.
      </p>
      <div className="mt-4">
        <Label htmlFor="delete-confirm">
          Digite <span className="font-semibold text-fg">{user.displayName}</span> para confirmar
        </Label>
        <Input
          id="delete-confirm"
          value={confirmText}
          autoComplete="off"
          onChange={(e) => setConfirmText(e.target.value)}
        />
      </div>
      <Footer
        pending={pending}
        danger
        label="Excluir usuário"
        disabled={confirmText.trim() !== user.displayName}
        onConfirm={() => run(() => deleteUser(user.id))}
      />
    </DialogContent>
  );
}
