import { Target } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { Avatar } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { BOLAO_MAX, BOLAO_POINTS } from "@/lib/bolao";
import { cn } from "@/lib/utils";
import { getBolaoRanking } from "@/services/bolao";

export const metadata: Metadata = { title: "Bolão" };

export default async function BolaoPage() {
  const ranking = await getBolaoRanking();
  const rows = ranking?.rows ?? [];

  return (
    <>
      <PageHeader
        title="Bolão"
        description="Palpite em todo mix, jogando ou não: vale só a glória (e a zoeira). O bolão abre quando os times são definidos e fecha no horário do mix."
      />

      <Card className="mb-4">
        <CardContent className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <span>
            Vencedor <strong className="text-brand">+{BOLAO_POINTS.winner}</strong>
          </span>
          <span>
            Placar de mapas exato <strong className="text-brand">+{BOLAO_POINTS.score}</strong>
            <span className="text-muted"> (com o vencedor certo)</span>
          </span>
          <span>
            MVP <strong className="text-brand">+{BOLAO_POINTS.mvp}</strong>
          </span>
          <span>
            Lanterna <strong className="text-brand">+{BOLAO_POINTS.lanterna}</strong>
          </span>
          <span className="text-muted">Máximo de {BOLAO_MAX} pontos por mix.</span>
        </CardContent>
      </Card>

      <Card>
        {rows.length ? (
          <Table>
            <THead>
              <TR>
                <TH className="w-14 text-center">#</TH>
                <TH className="min-w-40">Palpiteiro</TH>
                <TH className="text-right">Pontos</TH>
                <TH className="text-right" title="Mixes em que palpitou (finalizados)">
                  Palpites
                </TH>
                <TH className="text-right" title="Acertos do time vencedor">
                  Vencedor
                </TH>
                <TH className="text-right" title="Placares de mapas exatos">
                  Placar
                </TH>
                <TH className="text-right">MVP</TH>
                <TH className="text-right">Lanterna</TH>
              </TR>
            </THead>
            <tbody>
              {rows.map((r, i) => (
                <TR key={r.userId} className="hover:bg-surface-2/50">
                  <TD className="text-center">
                    <span
                      className={cn(
                        "inline-flex size-7 items-center justify-center rounded-sm font-display text-sm font-bold tabular",
                        i === 0 && "bg-brand text-brand-fg",
                        i === 1 && "bg-brand/25 text-brand",
                        i === 2 && "bg-brand/12 text-brand",
                        i > 2 && "text-muted",
                      )}
                    >
                      {i + 1}
                    </span>
                  </TD>
                  <TD>
                    <div className="flex items-center gap-2.5">
                      <Avatar name={r.name} src={r.avatarUrl} size="sm" />
                      <span className="font-medium">{r.name}</span>
                    </div>
                  </TD>
                  <TD className="text-right font-display text-base font-bold">{r.points}</TD>
                  <TD className="text-right text-muted">{r.bets}</TD>
                  <TD className="text-right">
                    {r.winners}
                    <span className="text-xs text-subtle"> ({Math.round((r.winners / r.bets) * 100)}%)</span>
                  </TD>
                  <TD className="text-right">{r.scores}</TD>
                  <TD className="text-right">{r.mvps}</TD>
                  <TD className="text-right">{r.lanternas}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState
            icon={Target}
            title={ranking ? "Nenhum bolão conferido ainda" : "Bolão indisponível"}
            description={
              ranking
                ? "Quando os times do próximo mix forem definidos, o bolão abre no Dashboard."
                : "Rode a migração 0031_bolao_push.sql no Supabase."
            }
            className="py-10"
          />
        )}
      </Card>
      {ranking && ranking.mixes > 0 && (
        <p className="mt-2 text-xs text-subtle">
          {ranking.mixes} mix{ranking.mixes > 1 ? "es" : ""} conferido{ranking.mixes > 1 ? "s" : ""}. Os pontos seguem o
          resultado oficial: se um mix for corrigido, o bolão é recalculado.
        </p>
      )}
    </>
  );
}
