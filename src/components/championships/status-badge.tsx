import { STATUS_LABEL, type ChampionshipStatus } from "@/lib/championship";
import { Badge } from "../ui/badge";

const VARIANT: Record<ChampionshipStatus, "neutral" | "brand" | "win" | "loss"> = {
  setup: "neutral",
  registration: "brand",
  teams: "brand",
  running: "win",
  playoffs: "win",
  finished: "neutral",
  cancelled: "loss",
};

export function ChampionshipStatusBadge({ status }: { status: ChampionshipStatus }) {
  return <Badge variant={VARIANT[status]}>{STATUS_LABEL[status]}</Badge>;
}
