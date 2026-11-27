import { cn } from "@/lib/utils";

/** "em 3 h", "em 2 dias", "há 40 min" */
function relative(to: Date, now: Date) {
  const diff = to.getTime() - now.getTime();
  const min = Math.round(Math.abs(diff) / 60_000);
  const text =
    min < 60 ? `${min} min` : min < 48 * 60 ? `${Math.round(min / 60)} h` : `${Math.round(min / (24 * 60))} dias`;
  return diff >= 0 ? `em ${text}` : `há ${text}`;
}

const hhmm = (d: Date) =>
  d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
const ddmm = (d: Date) =>
  d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });

/** Etapas do mix (inscrições → jogo → finalizar), com a atual em destaque. */
export function MixTimeline({
  opensAt,
  eventAt,
  now,
  classified,
  max,
  reserves,
}: {
  opensAt: Date;
  eventAt: Date;
  now: Date;
  classified: number;
  max: number;
  reserves: number;
}) {
  const stage = now < opensAt ? 0 : now < eventAt ? 1 : 2;
  const steps = [
    {
      title: "Inscrições",
      when: `${ddmm(opensAt)} às ${hhmm(opensAt)}`,
      note: stage === 0 ? `abrem ${relative(opensAt, now)}` : "abertas",
    },
    {
      title: "Mix",
      when: `${ddmm(eventAt)} às ${hhmm(eventAt)}`,
      note: stage <= 1 ? `começa ${relative(eventAt, now)}` : "em andamento",
    },
    { title: "Finalizar", when: "depois do jogo", note: stage === 2 ? "liberado" : "importar da GC" },
  ];
  return (
    <div className="space-y-3">
      <ol className="grid grid-cols-3 gap-2">
        {steps.map((s, i) => (
          <li
            key={s.title}
            aria-current={i === stage ? "step" : undefined}
            className={cn(
              "relative rounded-lg border px-3 py-2",
              i === stage
                ? "border-brand/60 bg-brand/10"
                : i < stage
                  ? "border-win/30 bg-win/5"
                  : "border-border bg-surface-2/40",
            )}
          >
            <div
              className={cn(
                "flex items-center gap-1.5 text-[11px] font-bold tracking-wider uppercase",
                i === stage ? "text-brand" : i < stage ? "text-win" : "text-muted",
              )}
            >
              <span
                className={cn(
                  "flex size-4 items-center justify-center rounded-full text-[10px]",
                  i === stage ? "bg-brand text-brand-fg" : i < stage ? "bg-win/20 text-win" : "bg-surface-3 text-muted",
                )}
              >
                {i < stage ? "✓" : i + 1}
              </span>
              {s.title}
            </div>
            <div className="mt-1 text-sm font-semibold tabular">{s.when}</div>
            <div className="text-xs text-muted">{s.note}</div>
          </li>
        ))}
      </ol>
      <div>
        <div className="mb-1 flex items-center justify-between text-xs text-muted">
          <span>Inscritos</span>
          <span className="tabular">
            <b className="text-fg">{classified}</b>/{max}
            {reserves > 0 ? ` · ${reserves} na reserva` : ""}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-3" aria-hidden>
          <div
            className="h-full rounded-full bg-brand"
            style={{ width: `${Math.min(100, (classified / Math.max(max, 1)) * 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
