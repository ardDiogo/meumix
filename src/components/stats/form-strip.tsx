import { cn } from "@/lib/utils";

type Result = "win" | "loss" | "draw";
const label: Record<Result, string> = { win: "V", loss: "D", draw: "E" };
const full: Record<Result, string> = { win: "Vitória", loss: "Derrota", draw: "Empate" };

/** Sequência de resultados (mais antigo → mais recente). */
export function FormStrip({ results, className }: { results: Result[]; className?: string }) {
  if (!results.length) return <span className="text-xs text-muted">Sem partidas</span>;
  return (
    <ol className={cn("flex flex-wrap gap-1", className)} aria-label="Resultados recentes">
      {results.map((r, i) => (
        <li
          key={i}
          title={full[r]}
          className={cn(
            "flex size-6 items-center justify-center rounded-sm text-[11px] font-bold",
            r === "win" && "bg-win/15 text-win",
            r === "loss" && "bg-loss/15 text-loss",
            r === "draw" && "bg-draw/15 text-draw",
          )}
        >
          <span aria-hidden>{label[r]}</span>
          <span className="sr-only">{full[r]}</span>
        </li>
      ))}
    </ol>
  );
}
