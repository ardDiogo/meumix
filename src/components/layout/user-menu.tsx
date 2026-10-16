"use client";

import { ChevronDown, KeyRound, LogIn, LogOut, Settings, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { signOut } from "@/app/entrar/actions";
import { Avatar } from "../ui/avatar";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

export interface MenuUser {
  displayName: string;
  email: string;
  roleLabel: string | null;
}

export function UserMenu({ user, showAdmin }: { user: MenuUser | null; showAdmin: boolean }) {
  if (!user) {
    return (
      <Button variant="primary" size="sm" asChild>
        <Link href="/entrar">
          <LogIn /> Entrar
        </Link>
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-md p-1 pr-2 transition-colors hover:bg-surface-2 data-[state=open]:bg-surface-2">
        <Avatar name={user.displayName} size="sm" />
        <span className="hidden text-sm font-medium sm:block">{user.displayName}</span>
        <ChevronDown className="hidden size-4 text-muted sm:block" aria-hidden />
        <span className="sr-only">Abrir menu do usuário</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>
          <div className="font-medium text-fg">{user.displayName}</div>
          <div className="truncate">{user.email}</div>
          {user.roleLabel && (
            <div className="mt-1 text-[11px] font-semibold tracking-wide text-brand uppercase">{user.roleLabel}</div>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {showAdmin && (
          <DropdownMenuItem asChild>
            <Link href="/admin">
              <ShieldCheck /> Administração
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <Link href="/redefinir-senha">
            <KeyRound /> Alterar senha
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/configuracoes">
            <Settings /> Configurações
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <form action={signOut}>
          <DropdownMenuItem asChild>
            <button type="submit" className="w-full">
              <LogOut /> Sair
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
