"use client";

import { ChevronDown, LogOut, Settings, ShieldCheck, UserRound } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import type { Player } from "@/types/domain";
import { Avatar } from "../ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

export function UserMenu({
  player,
  isDemo,
  showAdmin,
}: {
  player: Player | null;
  isDemo: boolean;
  showAdmin: boolean;
}) {
  const name = player?.nickname ?? "Visitante";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-md p-1 pr-2 transition-colors hover:bg-surface-2 data-[state=open]:bg-surface-2">
        <Avatar name={name} src={player?.avatarUrl} size="sm" />
        <span className="hidden text-sm font-medium sm:block">{name}</span>
        <ChevronDown className="hidden size-4 text-muted sm:block" aria-hidden />
        <span className="sr-only">Abrir menu do usuário</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>
          <div className="font-medium text-fg">{name}</div>
          {isDemo && <div>Conta de demonstração</div>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {player && (
          <DropdownMenuItem asChild>
            <Link href={`/jogadores/${player.id}`}>
              <UserRound /> Meu perfil
            </Link>
          </DropdownMenuItem>
        )}
        {showAdmin && (
          <DropdownMenuItem asChild>
            <Link href="/admin">
              <ShieldCheck /> Administração
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <Link href="/configuracoes">
            <Settings /> Configurações
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() =>
            toast.info("Autenticação ainda não implementada", {
              description: "O login será feito via Supabase Auth em uma próxima etapa.",
            })
          }
        >
          <LogOut /> Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
