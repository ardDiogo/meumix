import { UsersRound } from "lucide-react";
import { formatDecimal, formatInt, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Player } from "@/types/domain";
import type { PlayerAggregate } from "@/types/views";
import { Card } from "../ui/card";
import { Table, TD, TH, THead, TR } from "../ui/table";
import { CompareSelect } from "./compare-select";

type Better = "higher" | "lower";

const ROWS: {
  label: string;
  value: (s: PlayerAggregate) => number | null;
  format: (n: number) => string;
  better: Better;
}[] = [
  { label: "Mixes jogados", value: (s) => s.mixes, format: formatInt, better: "higher" },
  { label: "Win rate", value: (s) => s.winRate, format: (n) => formatPercent(n), better: "higher" },
  { label: "K/D", value: (s) => s.kd, format: (n) => formatDecimal(n), better: "higher" },
  { label: "Total de kills", value: (s) => s.kills, format: formatInt, better: "higher" },
  { label: "Total de mortes", value: (s) => s.deaths, format: formatInt, better: "lower" },
  { label: "First kills", value: (s) => s.firstKills, format: formatInt, better: "higher" },
  { label: "Média ADR", value: (s) => s.adr, format: (n) => formatDecimal(n, 1), better: "higher" },
  { label: "Média KAST", value: (s) => s.kast, format: (n) => formatPercent(n, 1), better: "higher" },
  { label: "MVPs", value: (s) => s.mvps, format: formatInt, better: "higher" },
  { label: "Lanternas", value: (s) => s.lanterns, format: formatInt, better: "lower" },
];

/** Cor de cada lado: verde para o melhor, vermelho para o pior, neutro no empate ou sem dados. */
function tone(a: number | null, b: number | null, better: Better): [string, string] {
  if (a == null || b == null || a === b) return ["text-fg", "text-fg"];
  const aWins = better === "higher" ? a > b : a < b;
  return aWins ? ["text-win", "text-loss"] : ["text-loss", "text-win"];
}

export function ComparePlayers({
  player,
  stats,
  other,
  options,
}: {
  player: Player;
  stats: PlayerAggregate;
  other: { player: Player; stats: PlayerAggregate } | null;
  options: { id: string; label: string }[];
}) {
  return (
    <Card className="mt-4">
      <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-display text-sm font-semibold tracking-wide uppercase">
            <UsersRound className="size-4 text-muted" aria-hidden /> Comparar com outro jogador
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            Selecione um jogador para comparar as estatísticas de todos os mixes.
          </p>
        </div>
        <CompareSelect options={options} value={other?.player.id ?? null} />
      </div>
      {other && (
        <Table>
          <THead>
            <TR>
              <TH className="min-w-36">Estatística</TH>
              <TH className="text-center text-sm text-fg normal-case">{player.nickname}</TH>
              <TH className="text-center text-sm text-fg normal-case">{other.player.nickname}</TH>
            </TR>
          </THead>
          <tbody>
            {ROWS.map((row) => {
              const a = row.value(stats);
              const b = row.value(other.stats);
              const [ta, tb] = tone(a, b, row.better);
              return (
                <TR key={row.label}>
                  <TD className="font-medium">{row.label}</TD>
                  <TD className={cn("text-center font-semibold", ta)}>{a == null ? "—" : row.format(a)}</TD>
                  <TD className={cn("text-center font-semibold", tb)}>{b == null ? "—" : row.format(b)}</TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
      )}
    </Card>
  );
}
