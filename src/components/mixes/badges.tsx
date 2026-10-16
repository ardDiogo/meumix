import { Badge } from "../ui/badge";
import type { MixStatus, TeamSide } from "@/types/domain";
import { cn } from "@/lib/utils";

export function ResultBadge({ result }: { result: "win" | "loss" | "draw" | null }) {
  if (!result) return null;
  const map = { win: ["win", "Vitória"], loss: ["loss", "Derrota"], draw: ["draw", "Empate"] } as const;
  const [variant, label] = map[result];
  return <Badge variant={variant}>{label}</Badge>;
}

const statusLabel: Record<MixStatus, string> = {
  scheduled: "Agendado",
  live: "Ao vivo",
  finished: "Finalizado",
  cancelled: "Cancelado",
};

export function StatusBadge({ status }: { status: MixStatus }) {
  return (
    <Badge variant={status === "live" ? "brand" : status === "scheduled" ? "brand" : "neutral"}>
      {status === "live" && <span className="size-1.5 animate-pulse rounded-full bg-brand" aria-hidden />}
      {statusLabel[status]}
    </Badge>
  );
}

export function TeamDot({ side, className }: { side: TeamSide; className?: string }) {
  return (
    <span
      className={cn("inline-block size-2 shrink-0 rounded-[2px]", side === "A" ? "bg-team-a" : "bg-team-b", className)}
      aria-hidden
    />
  );
}
