import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { formatSigned } from "@/lib/format";
import { cn } from "@/lib/utils";

export function Delta({ value, className }: { value: number; className?: string }) {
  const Icon = value > 0 ? ArrowUpRight : value < 0 ? ArrowDownRight : Minus;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-semibold tabular",
        value > 0 ? "text-win" : value < 0 ? "text-loss" : "text-muted",
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {formatSigned(value)}
    </span>
  );
}
