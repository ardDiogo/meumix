import { Trophy } from "lucide-react";
import { formatDecimal, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Team } from "@/types/domain";
import type { ScoreboardRow } from "@/types/views";
import { PlayerLink } from "../players/player-link";
import { Table, TD, TH, THead, TR } from "../ui/table";
import { TeamDot } from "./badges";

const dash = (v: number | null) => (v == null ? "—" : v);

/** Placar no estilo competitivo de CS2, separado por time. */
export function Scoreboard({
  rows,
  teams,
  mvpId,
  score,
}: {
  rows: ScoreboardRow[];
  teams: [Team, Team];
  mvpId: string | null;
  score?: [number | null, number | null];
}) {
  return (
    <div className="space-y-4">
      {teams.map((team, i) => {
        const teamRows = rows.filter((r) => r.side === team.side);
        return (
          <div key={team.side} className="overflow-hidden rounded-md border border-border">
            <div className="flex items-center justify-between gap-2 bg-surface-2 px-3 py-2">
              <div className="flex items-center gap-2 font-display text-sm font-semibold tracking-wide uppercase">
                <TeamDot side={team.side} />
                {team.name}
              </div>
              {score && score[i] != null && <span className="font-display text-lg font-bold tabular">{score[i]}</span>}
            </div>
            <Table>
              <THead>
                <TR>
                  <TH className="min-w-40">Jogador</TH>
                  <TH className="text-right" title="Abates">
                    K
                  </TH>
                  <TH className="text-right" title="Assistências">
                    A
                  </TH>
                  <TH className="text-right" title="Mortes">
                    D
                  </TH>
                  <TH className="text-right" title="Diferença de abates e mortes">
                    +/−
                  </TH>
                  <TH className="text-right">K/D</TH>
                  <TH className="text-right" title="Dano médio por round">
                    ADR
                  </TH>
                  <TH className="text-right" title="% de rounds com kill, assist, sobrevivência ou trade">
                    KAST
                  </TH>
                  <TH className="text-right" title="% de abates com headshot">
                    HS%
                  </TH>
                  <TH className="text-right" title="Primeiros abates – primeiras mortes">
                    FK–FD
                  </TH>
                  <TH className="text-right" title="Rounds com 3+ abates">
                    3K+
                  </TH>
                  <TH className="text-right" title="Clutches vencidos / disputados">
                    Clutch
                  </TH>
                </TR>
              </THead>
              <tbody>
                {teamRows.map((r) => (
                  <TR key={r.player.id} className="hover:bg-surface-2/50">
                    <TD>
                      <div className="flex items-center gap-2">
                        <PlayerLink player={r.player} />
                        {r.player.id === mvpId && (
                          <span
                            title="MVP da partida"
                            className="inline-flex items-center gap-0.5 text-[10px] font-bold text-brand uppercase"
                          >
                            <Trophy className="size-3" aria-hidden /> MVP
                          </span>
                        )}
                      </div>
                    </TD>
                    <TD className="text-right font-semibold">{r.kills}</TD>
                    <TD className="text-right text-muted">{r.assists}</TD>
                    <TD className="text-right text-muted">{r.deaths}</TD>
                    <TD
                      className={cn(
                        "text-right font-medium",
                        r.diff > 0 ? "text-win" : r.diff < 0 ? "text-loss" : "text-muted",
                      )}
                    >
                      {r.diff > 0 ? `+${r.diff}` : r.diff}
                    </TD>
                    <TD className="text-right">{formatDecimal(r.kd)}</TD>
                    <TD className="text-right">{formatDecimal(r.adr, 1)}</TD>
                    <TD className="text-right">{formatPercent(r.kast)}</TD>
                    <TD className="text-right text-muted">{formatPercent(r.hsPercent)}</TD>
                    <TD className="text-right text-muted">
                      {r.firstKills == null ? "—" : `${r.firstKills}–${dash(r.firstDeaths)}`}
                    </TD>
                    <TD className="text-right text-muted">{dash(r.multikills)}</TD>
                    <TD className="text-right text-muted">{r.clutches ?? "—"}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </div>
        );
      })}
    </div>
  );
}
