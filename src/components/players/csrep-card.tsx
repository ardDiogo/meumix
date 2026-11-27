import { CheckCircle2, ExternalLink, Sparkles, Target, TriangleAlert } from "lucide-react";
import { CSREP_METRICS, csrepPeriodPt, csrepTone, type AnalysisItem } from "@/lib/csrep";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CsrepView } from "@/services/csrep";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader } from "../ui/card";
import { CsrepLinkForm, CsrepUpload } from "./csrep-actions";

const fmt = (n: number, digits: number) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });

const DAY = 86_400_000;
const daysSince = (iso: string) => Math.floor((Date.now() - Date.parse(iso)) / DAY);
const ageText = (iso: string) => {
  const d = daysSince(iso);
  return d <= 0 ? "hoje" : d === 1 ? "ontem" : `há ${d} dias`;
};
/** Mais de 30 dias: a análise já não reflete o jogo de agora. */
const stale = (iso: string) => daysSince(iso) > 30;

function ItemList({
  title,
  items,
  icon: Icon,
  tone,
}: {
  title: string;
  items: AnalysisItem[];
  icon: typeof CheckCircle2;
  tone: string;
}) {
  if (!items.length) return null;
  return (
    <div className="min-w-0 rounded-lg border border-border bg-surface-2/50 p-4 break-words">
      <h3 className={cn("mb-3 flex items-center gap-2 text-sm font-semibold", tone)}>
        <Icon className="size-4" aria-hidden /> {title}
      </h3>
      <ul className="space-y-3">
        {items.map((i) => (
          <li key={i.title}>
            <div className="text-sm font-semibold">{i.title}</div>
            <p className="text-sm text-muted">{i.detail}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** CSRep no perfil: link, métricas lidas do print e análise da IA (informativa). */
export function CsrepCard({ userId, view, canEdit }: { userId: string; view: CsrepView; canEdit: boolean }) {
  const latest = view.latest;
  return (
    <Card className="mt-4">
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Sparkles className="size-4 text-brand" aria-hidden /> CSRep · análise por IA
          </span>
        }
        description="Pontos fortes, pontos fracos e sugestões de treino. Informativo: não entra no ELO nem nas estatísticas do MeuMix."
        action={
          view.url && (
            <Button variant="outline" size="sm" asChild>
              <a href={view.url} target="_blank" rel="noopener noreferrer">
                Abrir no CSRep <ExternalLink />
              </a>
            </Button>
          )
        }
      />
      <CardContent className="space-y-5">
        {!view.available && (
          <p className="text-sm text-muted">Disponível após rodar a migração 0013_csrep.sql no Supabase.</p>
        )}

        {latest ? (
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              <Badge variant="neutral">{csrepPeriodPt(latest.metrics.period)}</Badge>
              Analisado em {formatDate(latest.createdAt)} ({ageText(latest.createdAt)})
              {stale(latest.createdAt) && (
                <Badge variant="neutral" className="border-yellow-500/40 bg-yellow-500/10 text-yellow-300">
                  desatualizada{canEdit ? " · envie um print novo" : ""}
                </Badge>
              )}
            </div>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {CSREP_METRICS.filter((m) => latest.metrics[m.key] != null).map((m) => {
                const v = latest.metrics[m.key]!;
                const tone = csrepTone(m, v);
                return (
                  <li
                    key={m.key}
                    title={`${m.label} no CSRep${m.kind === "stat" ? " — de todas as partidas do período, não só dos mixes" : ""}`}
                    className={cn(
                      "min-w-0 rounded-lg border px-3 py-2.5",
                      tone === "good"
                        ? "border-win/30 bg-win/5"
                        : tone === "near"
                          ? "border-yellow-500/30 bg-yellow-500/5"
                          : tone === "bad"
                            ? "border-loss/30 bg-loss/5"
                            : "border-border bg-surface-2/50",
                    )}
                  >
                    <div className="truncate text-[10px] font-semibold tracking-wider text-muted uppercase">{m.pt}</div>
                    <div
                      className={cn(
                        "font-display text-2xl font-bold tabular",
                        tone === "good"
                          ? "text-win"
                          : tone === "near"
                            ? "text-yellow-300"
                            : tone === "bad"
                              ? "text-loss"
                              : "",
                      )}
                    >
                      {fmt(v, m.digits)}
                      {m.unit && <span className="ml-0.5 text-sm text-muted">{m.unit}</span>}
                    </div>
                    {m.ref != null && (
                      <div className="text-[11px] text-subtle">
                        bom: {m.better === "low" ? "<" : ">"} {fmt(m.ref, m.ref % 1 ? 1 : 0)}
                        {m.unit}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="text-xs text-subtle">
              K/D, ADR, rating e KAST aqui são do CSRep ({csrepPeriodPt(latest.metrics.period)}, todas as partidas na
              plataforma), por isso diferem do resumo do MeuMix, que conta só os mixes. Verde: dentro da referência;
              amarelo: perto; vermelho: longe.
            </p>
            <p className="rounded-lg border border-brand/30 bg-brand/5 p-4 text-sm break-words">
              {latest.analysis.summary}
            </p>
            <div className="grid gap-3 lg:grid-cols-3 [&>*]:min-w-0">
              <ItemList title="Pontos fortes" items={latest.analysis.strengths} icon={CheckCircle2} tone="text-win" />
              <ItemList
                title="Pontos fracos"
                items={latest.analysis.weaknesses}
                icon={TriangleAlert}
                tone="text-loss"
              />
              <ItemList title="Como melhorar" items={latest.analysis.improvements} icon={Target} tone="text-brand" />
            </div>
          </>
        ) : (
          view.available && (
            <p className="text-sm text-muted">
              Nenhuma análise ainda.{" "}
              {canEdit
                ? "Abra o perfil no CSRep, tire um print da tela Overview (Stats overview) e envie aqui."
                : "O jogador ou um administrador pode enviar um print do CSRep."}
            </p>
          )
        )}

        {canEdit && view.available && (
          <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
            <CsrepUpload userId={userId} />
            <div className="sm:w-96">
              <CsrepLinkForm userId={userId} savedUrl={view.savedUrl} />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
