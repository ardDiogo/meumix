import Link from "next/link";
import type { Player } from "@/types/domain";
import { cn } from "@/lib/utils";
import { Avatar } from "../ui/avatar";
import { playerHref } from "@/lib/player-slug";

export function PlayerLink({
  player,
  size = "xs",
  className,
  highlight,
}: {
  player: Player;
  size?: "xs" | "sm" | "md";
  className?: string;
  highlight?: boolean;
}) {
  return (
    <Link
      href={playerHref(player)}
      className={cn("group inline-flex min-w-0 items-center gap-2 rounded-sm", className)}
    >
      <Avatar name={player.nickname} src={player.avatarUrl} size={size} />
      <span className={cn("truncate font-medium group-hover:text-brand", highlight ? "text-brand" : "text-fg")}>
        {player.nickname}
      </span>
    </Link>
  );
}
