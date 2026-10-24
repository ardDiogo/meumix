import {
  BarChart3,
  Clapperboard,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  Swords,
  Target,
  Trophy,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Descrição curta, usada como dica e para leitores de tela. */
  description: string;
}

export const NAV_MAIN: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, description: "Seu resumo competitivo" },
  { href: "/mixes", label: "Mixes", icon: Swords, description: "Criar e consultar mixes" },
  { href: "/jogadores", label: "Jogadores", icon: Users, description: "Perfis e desempenho" },
  { href: "/rankings", label: "Rankings", icon: Trophy, description: "Classificação por ELO" },
  { href: "/bolao", label: "Bolão", icon: Target, description: "Palpites e ranking dos palpiteiros" },
  { href: "/estatisticas", label: "Estatísticas", icon: BarChart3, description: "Números da comunidade" },
  { href: "/clipes", label: "Clipes", icon: Clapperboard, description: "Clipes e highlights" },
];

export const NAV_ADMIN: NavItem = {
  href: "/admin",
  label: "Administração",
  icon: ShieldCheck,
  description: "Criar e gerenciar mixes",
};

export const NAV_SECONDARY: NavItem[] = [
  { href: "/configuracoes", label: "Configurações", icon: Settings, description: "Conta e integrações" },
];
