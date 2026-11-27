import { ArrowLeft, FlaskConical, LockKeyhole } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { aggregateGc } from "@/lib/gc-analysis";
import { mixHref } from "@/lib/mix-slug";
import { rankByPts, SIM_VARIANTS, simElo, type SimMix } from "@/lib/pts-sim";
import { seriesWinner } from "@/lib/stats";
import { cn } from "@/lib/utils";
import { getDataSource } from "@/services";
import { getPermissions } from "@/services/auth";
import { getGcMaps } from "@/services/gc-maps";
import { getCurrentLeague } from "@/services/league";
import { getMatchReport } from "@/services/match-report";

export const metadata: Metadata = { title: "Simulação da PTS" };

const f1 = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)}`;

/** Super admin: compara a PTS atual com versões novas, só lendo os dados (não grava nada). */
export default async function SimulationPage() {
  const { session } = await getPermissions();
  if (!session?.isSuperAdmin) {
    return (
      <Card>
        <EmptyState icon={LockKeyhole} title="Só o super admin vê a simulação" className="py-10" />
      </Card>
    );
  }
  const ds = getDataSource();
  const [league, all] = await Promise.all([getCurrentLeague(), ds.listMixes({ status: "finished" })]);

  // Dados de cada mix: o relatório (K/A/D, FK, ADR, trades, ELO de antes) e o Swing da GC.
  const mixes: SimMix[] = [];
  let withSwing = 0;
  let withTrades = 0;
  for (const mix of [...all].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))) {
    const [report, gc] = await Promise.all([getMatchReport(mix.id), getGcMaps(mix.id)]);
    if (!report?.rows.length) continue;
    const lines = gc.length ? aggregateGc(gc) : [];
    const winner = seriesWinner(mix);
    if (lines.some((l) => l.swing != null)) withSwing++;
    if (report.rows.some((r) => r.tradedDeaths != null)) withTrades++;
    mixes.push({
      id: mix.id,
      name: mix.name,
      date: mix.scheduledAt,
      players: report.rows.map((r) => {
        const l = lines.find((x) => (r.userId ? x.userId === r.userId : x.nick === r.name));
        return {
          key: r.key,
          userId: r.userId,
          name: r.profileNick ?? r.name,
          team: r.team,
          k: r.k,
          a: r.a,
          d: r.d,
          fk: r.fk,
          adr: r.adr,
          tradedDeaths: r.tradedDeaths ?? null,
          swing: l?.swing ?? null,
          rounds: l?.rounds ?? null,
          clutch1Won: l?.clutch.v1Won ?? 0,
          clutchNWon: l?.clutch.vnWon ?? 0,
          eloBefore: r.elo != null && r.eloDelta != null ? r.elo - r.eloDelta : r.elo,
          score: !winner ? 0.5 : winner === r.team ? 1 : 0,
        };
      }),
    });
  }
  const last = mixes.at(-1);
  const lastRanks = last ? SIM_VARIANTS.map((v) => rankByPts(last.players, v)) : [];

  // ELO final de cada um em cada variante.
  const names = new Map<string, string>();
  for (const m of mixes) for (const p of m.players) if (p.userId) names.set(p.userId, p.name);
  const finals = SIM_VARIANTS.map((v) => simElo(mixes, v));
  const atual = finals[0]!;
  const ids = [...atual.keys()].sort((a, b) => (atual.get(b) ?? 0) - (atual.get(a) ?? 0));
  const posIn = (m: Map<string, number>) => {
    const order = [...m.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
    return (id: string) => order.indexOf(id) + 1;
  };
  const positions = finals.map(posIn);

  return (
    <>
      <Button variant="ghost" size="sm" className="mb-3 -ml-2" asChild>
        <Link href="/admin?aba=configuracoes">
          <ArrowLeft /> Configurações
        </Link>
      </Button>
      <PageHeader
        title="Simulação da PTS"
        description={`Só leitura: nada é gravado. ${league && !league.none ? league.name : "Liga atual"} · ${mixes.length} mixes (${withTrades} com trades e ${withSwing} com Swing da GC).`}
        actions={<FlaskConical className="size-5 text-brand" />}
      />

      <Card className="mb-4">
        <CardHeader title="As versões" />
        <CardContent className="space-y-1 pt-3 text-sm text-muted">
          <p>
            <b className="text-fg">Atual:</b> 3 × K + 1,5 × A + 2 × FK + 0,2 × ADR − 0,5 × morte trocada − 1,5 × morte
            não trocada (sem dados de trade: −1,5 por morte).
          </p>
          <p>
            <b className="text-fg">Novas:</b> morte não trocada −2,5 (sem dados de trade: −2 por morte) + peso × (Swing
            × rounds ÷ 100), ou seja, pontos por round que o jogador ganhou ou perdeu para o time. Peso 2, 5 e 6.
          </p>
          <p>
            <b className="text-fg">Com clutch:</b> morte não trocada −2,5 + bônus por clutch vencido (1v1 +3, 1v2 ou
            mais +5; perder clutch não tira nada). Uma versão só com o clutch e outra com clutch + Swing ×5.
          </p>
          <p className="text-xs text-subtle">
            O lanterna tem conta própria e não muda. O ELO simulado parte do ELO de antes de cada jogador no primeiro
            mix e soma o RP mix a mix: é uma aproximação do recálculo do site (ajustes manuais de ELO ficam de fora).
          </p>
        </CardContent>
      </Card>

      {last && (
        <Card className="mb-4">
          <CardHeader
            title={`Último mix · ${last.name}`}
            description="PTS e posição em cada versão. ★ = MVP."
            action={
              <Link
                href={mixHref({ id: last.id, scheduledAt: last.date })}
                className="text-xs text-muted hover:text-brand"
              >
                Ver o mix →
              </Link>
            }
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="border-b border-border text-xs text-muted">
                <tr>
                  <th className="px-4 py-2 text-left">Jogador</th>
                  <th className="px-2 py-2 text-right">Swing</th>
                  <th className="px-2 py-2 text-right" title="Clutches vencidos: 1v1 / 1v2 ou mais">
                    Clutch
                  </th>
                  {SIM_VARIANTS.map((v) => (
                    <th key={v.key} className="px-2 py-2 text-right">
                      {v.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lastRanks[0]!.map(({ p }) => (
                  <tr key={p.key} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 font-medium">{p.name}</td>
                    <td
                      className={cn(
                        "px-2 py-2 text-right tabular",
                        (p.swing ?? 0) > 0 ? "text-win" : (p.swing ?? 0) < 0 ? "text-loss" : "text-subtle",
                      )}
                    >
                      {p.swing == null ? "—" : `${p.swing > 0 ? "+" : ""}${f1(p.swing * 100)}%`}
                    </td>
                    <td className="px-2 py-2 text-right text-muted tabular">
                      {p.clutch1Won || p.clutchNWon ? `${p.clutch1Won} / ${p.clutchNWon}` : "—"}
                    </td>
                    {lastRanks.map((rank, vi) => {
                      const i = rank.findIndex((x) => x.p.key === p.key);
                      const base = lastRanks[0]!.findIndex((x) => x.p.key === p.key);
                      const moved = base - i;
                      return (
                        <td key={vi} className="px-2 py-2 text-right tabular">
                          <span className={cn(i === 0 && "font-bold text-brand")}>
                            {i === 0 && "★ "}
                            {f1(rank[i]!.pts)}
                          </span>{" "}
                          <span className="text-xs text-subtle">{i + 1}º</span>
                          {vi > 0 && moved !== 0 && (
                            <span className={cn("ml-1 text-[10px] font-bold", moved > 0 ? "text-win" : "text-loss")}>
                              {moved > 0 ? "▲" : "▼"}
                              {Math.abs(moved)}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card className="mb-4">
        <CardHeader title="MVP de cada mix" description="Em laranja, quando a versão muda o MVP." />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-border text-xs text-muted">
              <tr>
                <th className="px-4 py-2 text-left">Mix</th>
                {SIM_VARIANTS.map((v) => (
                  <th key={v.key} className="px-2 py-2 text-left">
                    {v.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...mixes].reverse().map((m) => {
                const mvps = SIM_VARIANTS.map((v) => rankByPts(m.players, v)[0]?.p.name ?? "—");
                return (
                  <tr key={m.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 font-medium">{m.name}</td>
                    {mvps.map((n, i) => (
                      <td key={i} className={cn("px-2 py-2", i > 0 && n !== mvps[0] ? "font-semibold text-brand" : "")}>
                        {n}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Ranking de ELO refeito"
          description="ELO final de cada um refazendo o histórico com cada versão. ▲▼ = posições em relação à versão atual."
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-border text-xs text-muted">
              <tr>
                <th className="px-4 py-2 text-left">Jogador</th>
                {SIM_VARIANTS.map((v) => (
                  <th key={v.key} className="px-2 py-2 text-right">
                    {v.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ids.map((id) => (
                <tr key={id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 font-medium">
                    <span className="mr-1.5 text-xs text-subtle tabular">{positions[0]!(id)}º</span>
                    {names.get(id) ?? "Jogador"}
                  </td>
                  {finals.map((m, vi) => {
                    const e = m.get(id) ?? 0;
                    const diff = e - (atual.get(id) ?? 0);
                    const moved = positions[0]!(id) - positions[vi]!(id);
                    return (
                      <td key={vi} className="px-2 py-2 text-right tabular">
                        {e}
                        {vi > 0 && diff !== 0 && (
                          <span className={cn("ml-1 text-xs", diff > 0 ? "text-win" : "text-loss")}>
                            ({signed(diff)})
                          </span>
                        )}
                        {vi > 0 && moved !== 0 && (
                          <span className={cn("ml-1 text-[10px] font-bold", moved > 0 ? "text-win" : "text-loss")}>
                            {moved > 0 ? "▲" : "▼"}
                            {Math.abs(moved)}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-border px-4 py-3 text-xs text-subtle">
          A coluna “Atual” é a própria simulação com a fórmula de hoje: compare com o ranking do site para ver o quanto
          a aproximação bate.
        </p>
      </Card>
    </>
  );
}
