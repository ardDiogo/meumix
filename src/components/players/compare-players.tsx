import { Swords, UsersRound } from "lucide-react";
import { formatDecimal, formatInt, formatPercent } from "@/lib/format";
import { mapName } from "@/lib/maps";
import { cn } from "@/lib/utils";
import type { MapId, Player } from "@/types/domain";
import type { PlayerAggregate } from "@/types/views";
import { MapIcon } from "../maps/map-icon";
import { LevelBadge } from "../players/level-badge";
import { Card } from "../ui/card";
import { Avatar } from "../ui/avatar";
import { Table, TD, TH, THead, TR } from "../ui/table";
import { CompareSelect } from "./compare-select";

type Better = "higher" | "lower";

/** Dados de cada lado além do agregado (ELO, GC e PTS média). */
export interface CompareSide {
  elo: number;
  rating: number | null;
  hsRate: number | null;
  ptsAvg: number | null;
}

export interface CompareExtra {
  a: CompareSide;
  b: CompareSide;
  /** No mesmo time: mixes, vitórias e derrotas (do ponto de vista dos dois). */
  together: { played: number; won: number; lost: number };
  /** Um contra o outro: mixes, vitórias de quem está no perfil e do outro. */
  against: { played: number; mine: number; theirs: number };
  maps: { mapId: MapId; a: { played: number; winRate: number }; b: { played: number; winRate: number } }[];
}

/** Menos que isso (de um dos dois): a comparação é só indicativa. */
const MIN_MIXES = 3;
const perMix = (n: number, s: PlayerAggregate) => (s.mixes ? n / s.mixes : null);

type RowDef = {
  label: string;
  value: (s: PlayerAggregate, x: CompareSide | null) => number | null;
  format: (n: number) => string;
  better: Better | null;
  /** Total (sem média), mostrado embaixo. */
  total?: (s: PlayerAggregate) => number;
  hint?: string;
};

const ROWS: RowDef[] = [
  { label: "ELO", value: (_, x) => x?.elo ?? null, format: formatInt, better: "higher" },
  { label: "Win rate", value: (s) => s.winRate, format: (n) => formatPercent(n), better: "higher" },
  { label: "K/D", value: (s) => s.kd, format: (n) => formatDecimal(n), better: "higher" },
  {
    label: "Rating (GC)",
    value: (_, x) => x?.rating ?? null,
    format: (n) => formatDecimal(n),
    better: "higher",
    hint: "Rating da Gamers Club nos mixes importados",
  },
  {
    label: "PTS média por mix",
    value: (_, x) => x?.ptsAvg ?? null,
    format: (n) => formatDecimal(n, 1),
    better: "higher",
    hint: "A pontuação do mix (a que escolhe o MVP), em média",
  },
  {
    label: "Kills por mix",
    value: (s) => perMix(s.kills, s),
    format: (n) => formatDecimal(n, 1),
    better: "higher",
    total: (s) => s.kills,
  },
  {
    label: "Mortes por mix",
    value: (s) => perMix(s.deaths, s),
    format: (n) => formatDecimal(n, 1),
    better: "lower",
    total: (s) => s.deaths,
  },
  {
    label: "First kills por mix",
    value: (s) => perMix(s.firstKills, s),
    format: (n) => formatDecimal(n, 1),
    better: "higher",
    total: (s) => s.firstKills,
  },
  { label: "ADR", value: (s) => s.adr, format: (n) => formatDecimal(n, 1), better: "higher" },
  { label: "KAST", value: (s) => s.kast, format: (n) => formatPercent(n, 1), better: "higher" },
  {
    label: "HS% (GC)",
    value: (_, x) => x?.hsRate ?? null,
    format: (n) => formatPercent(n),
    better: "higher",
  },
  {
    label: "MVP (% dos mixes)",
    value: (s) => (s.mixes ? (s.mvps / s.mixes) * 100 : null),
    format: (n) => formatPercent(n),
    better: "higher",
    total: (s) => s.mvps,
  },
  {
    label: "Lanterna (% dos mixes)",
    value: (s) => (s.mixes ? (s.lanterns / s.mixes) * 100 : null),
    format: (n) => formatPercent(n),
    better: "lower",
    total: (s) => s.lanterns,
  },
];

/** Quem foi melhor na linha: "a", "b" ou null (empate ou sem dado). Diferença < 2%: empate. */
function winner(a: number | null, b: number | null, better: Better | null): "a" | "b" | null {
  if (a == null || b == null || better == null) return null;
  const base = Math.max(Math.abs(a), Math.abs(b), 1e-9);
  if (Math.abs(a - b) / base < 0.02) return null;
  return (better === "higher" ? a > b : a < b) ? "a" : "b";
}

export function ComparePlayers({
  player,
  stats,
  other,
  options,
  extra,
}: {
  player: Player;
  stats: PlayerAggregate;
  other: { player: Player; stats: PlayerAggregate } | null;
  options: { id: string; label: string }[];
  extra?: CompareExtra | null;
}) {
  const weak = !!other && Math.min(stats.mixes, other.stats.mixes) < MIN_MIXES;
  const rows = other
    ? ROWS.map((row) => {
        const a = row.value(stats, extra?.a ?? null);
        const b = row.value(other.stats, extra?.b ?? null);
        return { row, a, b, w: winner(a, b, row.better) };
      }).filter((r) => r.a != null || r.b != null)
    : [];
  // O ELO fica fora do placar: depende do nível GC de entrada, não só do jogo nos mixes.
  const scored = rows.filter((r) => r.row.label !== "ELO");
  const score = {
    a: scored.filter((r) => r.w === "a").length,
    b: scored.filter((r) => r.w === "b").length,
    tie: scored.filter((r) => r.w == null && r.a != null && r.b != null).length,
  };
  const head = (p: Player, s: PlayerAggregate, x: CompareSide | undefined) => (
    <span className="inline-flex flex-col items-center gap-2 py-2 sm:flex-row sm:gap-3">
      <Avatar name={p.nickname} src={p.avatarUrl} size="xl" className="size-12 text-base sm:size-20 sm:text-2xl" />
      <span className="flex flex-col items-center gap-1 sm:items-start">
        <span className="flex items-center gap-1.5">
          {p.nickname}
          {x && <LevelBadge elo={x.elo} />}
        </span>
        <span className="text-xs font-normal text-muted">
          {s.mixes} {s.mixes === 1 ? "mix" : "mixes"}
        </span>
      </span>
    </span>
  );

  return (
    <Card className="mt-4">
      <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-display text-sm font-semibold tracking-wide uppercase">
            <UsersRound className="size-4 text-muted" aria-hidden /> Comparar com outro jogador
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            Médias por mix (quem jogou mais não leva vantagem), frente a frente e mapas em comum.
          </p>
        </div>
        <CompareSelect options={options} value={other?.player.id ?? null} />
      </div>
      {other && (
        <>
          {/* Placar das linhas: quem foi melhor em cada estatística. */}
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-1 border-b border-border bg-surface-2/40 px-4 py-3 text-sm">
            <span>
              Vantagem: <b className={score.a > score.b ? "text-win" : "text-fg"}>{player.nickname}</b> em{" "}
              <b>{score.a}</b> · <b className={score.b > score.a ? "text-win" : "text-fg"}>{other.player.nickname}</b>{" "}
              em <b>{score.b}</b> · empate em <b>{score.tie}</b>
            </span>
            {weak && (
              <span className="rounded border border-yellow-500/40 bg-yellow-500/10 px-2 py-0.5 text-xs text-yellow-300">
                Poucos mixes (menos de {MIN_MIXES}): comparação só indicativa
              </span>
            )}
          </div>

          {extra && (extra.together.played > 0 || extra.against.played > 0) && (
            <div className="grid gap-px border-b border-border bg-border sm:grid-cols-2">
              <div className="bg-surface px-4 py-3">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-muted uppercase">
                  <UsersRound className="size-3.5" /> No mesmo time
                </div>
                {extra.together.played ? (
                  <div className="mt-1 text-sm">
                    <b className="font-display text-lg">{extra.together.played}</b>{" "}
                    {extra.together.played === 1 ? "mix" : "mixes"} ·{" "}
                    <span className="text-win">{extra.together.won}V</span>
                    {extra.together.played - extra.together.won - extra.together.lost > 0 && (
                      <> · {extra.together.played - extra.together.won - extra.together.lost}E</>
                    )}{" "}
                    · <span className="text-loss">{extra.together.lost}D</span>
                  </div>
                ) : (
                  <div className="mt-1 text-sm text-muted">Nunca jogaram juntos.</div>
                )}
              </div>
              <div className="bg-surface px-4 py-3">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-muted uppercase">
                  <Swords className="size-3.5" /> Um contra o outro
                </div>
                {extra.against.played ? (
                  <div className="mt-1 text-sm">
                    <b className="font-display text-lg">{extra.against.played}</b>{" "}
                    {extra.against.played === 1 ? "mix" : "mixes"} · {player.nickname}{" "}
                    <b className={extra.against.mine > extra.against.theirs ? "text-win" : ""}>{extra.against.mine}</b>{" "}
                    ×{" "}
                    <b className={extra.against.theirs > extra.against.mine ? "text-win" : ""}>
                      {extra.against.theirs}
                    </b>{" "}
                    {other.player.nickname}
                  </div>
                ) : (
                  <div className="mt-1 text-sm text-muted">Nunca se enfrentaram.</div>
                )}
              </div>
            </div>
          )}

          <Table>
            <THead>
              <TR>
                <TH className="min-w-36">Estatística</TH>
                <TH className="text-center text-sm text-fg normal-case">{head(player, stats, extra?.a)}</TH>
                <TH className="text-center text-sm text-fg normal-case">{head(other.player, other.stats, extra?.b)}</TH>
              </TR>
            </THead>
            <tbody>
              {rows.map(({ row, a, b, w }) => {
                const cell = (v: number | null, side: "a" | "b", s: PlayerAggregate) => (
                  <TD
                    className={cn(
                      "text-center font-semibold",
                      w == null ? "text-fg" : w === side ? "text-win" : "text-loss",
                      weak && w != null && "opacity-60",
                    )}
                  >
                    {v == null ? "—" : row.format(v)}
                    {row.total && (
                      <span className="block text-[11px] font-normal text-subtle">total {row.total(s)}</span>
                    )}
                  </TD>
                );
                return (
                  <TR key={row.label}>
                    <TD className="font-medium" title={row.hint}>
                      {row.label}
                    </TD>
                    {cell(a, "a", stats)}
                    {cell(b, "b", other.stats)}
                  </TR>
                );
              })}
            </tbody>
          </Table>

          {extra && extra.maps.length > 0 && (
            <div className="border-t border-border px-4 py-3">
              <div className="mb-2 text-[11px] font-semibold tracking-wider text-muted uppercase">
                Mapas em comum (aproveitamento)
              </div>
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {extra.maps.map((m) => {
                  const mw = winner(m.a.winRate, m.b.winRate, "higher");
                  return (
                    <li
                      key={m.mapId}
                      className="flex items-center justify-between gap-2 rounded-md border border-border bg-surface-2/40 px-3 py-2 text-sm"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <MapIcon id={m.mapId} size={20} />
                        <span className="truncate">{mapName(m.mapId)}</span>
                      </span>
                      <span className="shrink-0 text-xs tabular">
                        <b className={mw === "a" ? "text-win" : mw === "b" ? "text-loss" : ""}>{m.a.winRate}%</b>
                        <span className="text-subtle"> ({m.a.played}) × </span>
                        <b className={mw === "b" ? "text-win" : mw === "a" ? "text-loss" : ""}>{m.b.winRate}%</b>
                        <span className="text-subtle"> ({m.b.played})</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-2 text-[11px] text-subtle">
                {player.nickname} × {other.player.nickname} · entre parênteses, quantos jogos no mapa.
              </p>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
