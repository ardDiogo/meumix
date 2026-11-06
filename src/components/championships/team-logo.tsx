import { cn } from "@/lib/utils";

/** Escudo do time; sem imagem, a sigla na cor do time. */
export function TeamLogo({
  team,
  size = 40,
  className,
}: {
  team: { id: string; name: string; tag: string; color: string; hasLogo: boolean; logoVersion?: string };
  size?: number;
  className?: string;
}) {
  const style = { width: size, height: size };
  if (team.hasLogo)
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/api/campeonatos/times/${team.id}/logo${team.logoVersion ? `?v=${team.logoVersion}` : ""}`}
        alt=""
        style={{ ...style, borderColor: team.color }}
        className={cn("shrink-0 rounded-lg border-2 object-cover", className)}
      />
    );
  const label = team.tag || team.name.slice(0, 2).toUpperCase();
  return (
    <span
      aria-hidden
      style={{ ...style, background: `${team.color}26`, borderColor: `${team.color}99`, color: team.color }}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg border-2 font-display font-bold",
        size >= 48 ? "text-base" : "text-xs",
        className,
      )}
    >
      {label}
    </span>
  );
}
