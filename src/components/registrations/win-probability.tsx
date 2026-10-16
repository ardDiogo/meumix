import { cn } from "@/lib/utils";

/** Barra de chance de vitória entre os dois times. */
export function WinProbability({
  probA,
  nameA,
  nameB,
  className,
}: {
  probA: number;
  nameA: string;
  nameB: string;
  className?: string;
}) {
  const a = Math.round(probA * 100);
  const b = 100 - a;
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center justify-between text-xs font-semibold">
        <span className="text-team-a">
          {nameA} · {a}%
        </span>
        <span className="text-[10px] tracking-wider text-muted uppercase">Chance de vitória</span>
        <span className="text-team-b">
          {b}% · {nameB}
        </span>
      </div>
      <div
        className="flex h-2.5 overflow-hidden rounded-full bg-surface-3"
        role="img"
        aria-label={`${nameA} ${a}%, ${nameB} ${b}%`}
      >
        <div className="bg-team-a" style={{ width: `${a}%` }} />
        <div className="bg-team-b" style={{ width: `${b}%` }} />
      </div>
    </div>
  );
}
