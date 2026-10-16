import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  accent,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  accent?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("relative rounded-lg border border-border bg-surface px-4 py-3", className)}>
      {accent && <span className="absolute inset-y-3 left-0 w-0.5 rounded-r bg-brand" aria-hidden />}
      <div className="text-[11px] font-semibold tracking-wider text-muted uppercase">{label}</div>
      <div
        className={cn("mt-1 font-display text-2xl leading-tight font-bold tabular", accent ? "text-brand" : "text-fg")}
      >
        {value}
      </div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </div>
  );
}
