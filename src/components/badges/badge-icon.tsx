import {
  Award,
  Crosshair,
  Crown,
  Flame,
  Gem,
  Heart,
  Medal,
  Rocket,
  Shield,
  Skull,
  Star,
  Target,
  Trophy,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { BADGE_IMAGES } from "@/lib/badge-images";
import { cn } from "@/lib/utils";

/** Ícones disponíveis para as insígnias (a chave fica salva no banco). */
export const BADGE_ICONS: Record<string, { icon: LucideIcon; label: string }> = {
  trophy: { icon: Trophy, label: "Troféu" },
  crown: { icon: Crown, label: "Coroa" },
  medal: { icon: Medal, label: "Medalha" },
  award: { icon: Award, label: "Prêmio" },
  star: { icon: Star, label: "Estrela" },
  flame: { icon: Flame, label: "Fogo" },
  zap: { icon: Zap, label: "Raio" },
  target: { icon: Target, label: "Alvo" },
  crosshair: { icon: Crosshair, label: "Mira" },
  shield: { icon: Shield, label: "Escudo" },
  rocket: { icon: Rocket, label: "Foguete" },
  gem: { icon: Gem, label: "Joia" },
  heart: { icon: Heart, label: "Coração" },
  skull: { icon: Skull, label: "Caveira" },
};

export const BADGE_COLORS = [
  "#FF6A00",
  "#EAB308",
  "#22C55E",
  "#06B6D4",
  "#3B82F6",
  "#A855F7",
  "#EC4899",
  "#EF4444",
  "#A1A1AA",
];

/** Selo da insígnia: imagem 3D ou ícone na cor escolhida. */
export function BadgeIcon({
  icon,
  color,
  size = "sm",
  title,
  className,
}: {
  icon: string;
  color: string;
  size?: "xs" | "sm" | "md";
  title?: string;
  className?: string;
}) {
  const box = size === "xs" ? "size-6" : size === "sm" ? "size-8" : "size-11";
  const image = BADGE_IMAGES[icon];
  if (image) {
    return (
      <span title={title} className={cn("inline-flex shrink-0 items-center justify-center", box, className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image.src} alt="" aria-hidden className="size-full object-contain drop-shadow" />
      </span>
    );
  }
  const Icon = (BADGE_ICONS[icon] ?? BADGE_ICONS.trophy!).icon;
  const glyph = size === "xs" ? "size-3.5" : size === "sm" ? "size-4" : "size-6";
  return (
    <span
      title={title}
      className={cn("inline-flex shrink-0 items-center justify-center rounded-lg border", box, className)}
      style={{ borderColor: `${color}66`, background: `${color}1F`, color }}
    >
      <Icon className={glyph} aria-hidden />
    </span>
  );
}
