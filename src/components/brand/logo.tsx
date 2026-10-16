import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Marca tipográfica "meumix".
 * `symbol` é o espaço reservado para o futuro símbolo da marca; até lá
 * usamos uma marca geométrica mínima (chanfro + barra) em laranja.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("size-6", className)} aria-hidden>
      <path d="M2 6 6 2h16v16l-4 4H2z" fill="var(--color-brand)" />
      <path d="M7 17V7h2.6l2.4 4 2.4-4H17v10h-2.6v-5.4L12 15.4l-2.4-3.8V17z" fill="var(--color-brand-fg)" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn("font-display text-[19px] leading-none font-bold tracking-[-0.01em] text-fg lowercase", className)}
    >
      meu<span className="text-brand">mix</span>
    </span>
  );
}

export function Logo({
  href = "/dashboard",
  symbol = <LogoMark />,
  className,
}: {
  href?: string;
  symbol?: React.ReactNode | null;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn("inline-flex items-center gap-2 rounded-md", className)}
      aria-label="MeuMix — início"
    >
      {symbol}
      <Wordmark />
    </Link>
  );
}
