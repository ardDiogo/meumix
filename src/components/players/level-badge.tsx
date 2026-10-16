import { levelForElo } from "@/lib/levels";
import { cn } from "@/lib/utils";

/** Selo do nível (1–10) calculado pelo ELO. */
export function LevelBadge({ elo, className, size = "sm" }: { elo: number; className?: string; size?: "sm" | "md" }) {
  const l = levelForElo(elo);
  return (
    <span
      title={`Nível ${l.level} (${l.min}–${l.max} de ELO)`}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full border-2 font-display font-bold tabular",
        size === "sm" ? "size-6 text-[11px]" : "size-9 text-sm",
        className,
      )}
      style={{ borderColor: l.color, color: l.color }}
    >
      {l.level}
    </span>
  );
}
