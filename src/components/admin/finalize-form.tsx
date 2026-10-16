"use client";

import { AlertCircle, Crown, Flag, Loader2, Plus, Trash2, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { finalizeMix, type FinalizeMap, type FinalizePlayer } from "@/app/(app)/admin/finalizar/actions";
import { ELO_CAP, levelForElo } from "@/lib/levels";
import { pickMvpAndLanterna } from "@/lib/match-rules";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader } from "../ui/card";
import { Input, Select } from "../ui/input";
import { TeamDot } from "../mixes/badges";

interface PlayerDraft extends Omit<
  FinalizePlayer,
  "kills" | "deaths" | "assists" | "firstKills" | "adr" | "kast" | "rp"
> {
  key: string;
  elo: number | null;
  kills: string;
  deaths: string;
  assists: string;
  firstKills: string;
  adr: string;
  kast: string;
  rp: string;
}

const intOr0 = (v: string) => (v.trim() === "" ? 0 : Number(v));
const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));

export function FinalizeForm({
  scheduleId,
  date,
  maps,
  initialMaps,
  players,
}: {
  scheduleId: string;
  date: string;
  maps: { id: string; name: string }[];
  initialMaps: string[];
  players: { userId: string; name: string; team: "A" | "B"; elo: number }[];
}) {
  const router = useRouter();
  const [saving, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [mapRows, setMapRows] = useState<{ mapId: string; scoreA: string; scoreB: string }[]>(
    (initialMaps.length ? initialMaps : [maps[0]?.id ?? ""]).map((id) => ({ mapId: id, scoreA: "", scoreB: "" })),
  );
  const [rows, setRows] = useState<PlayerDraft[]>(
    players.map((p) => ({
      key: p.userId,
      userId: p.userId,
      name: p.name,
      team: p.team,
      elo: p.elo,
      kills: "",
      deaths: "",
      assists: "",
      firstKills: "",
      adr: "",
      kast: "",
      rp: "",
      calculateElo: true,
    })),
  );

  const update = (key: string, patch: Partial<PlayerDraft>) =>
    setRows((r) => r.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  const parsed = useMemo(
    () =>
      rows.map((r) => ({
        kills: intOr0(r.kills),
        deaths: intOr0(r.deaths),
        assists: intOr0(r.assists),
        adr: numOrNull(r.adr),
      })),
    [rows],
  );
  // Só aponta MVP/lanterna depois que alguma estatística foi preenchida.
  const hasStats = parsed.some((p) => p.kills > 0 || p.deaths > 0);
  const { mvp, lanterna } = hasStats ? pickMvpAndLanterna(parsed) : { mvp: -1, lanterna: -1 };
  const wins = mapRows.reduce(
    (acc, m) => {
      const a = Number(m.scoreA);
      const b = Number(m.scoreB);
      if (m.scoreA !== "" && m.scoreB !== "" && a !== b) acc[a > b ? "A" : "B"] += 1;
      return acc;
    },
    { A: 0, B: 0 },
  );

  function submit() {
    setError(null);
    const payloadMaps: FinalizeMap[] = mapRows.map((m) => ({
      mapId: m.mapId,
      scoreA: Number(m.scoreA),
      scoreB: Number(m.scoreB),
    }));
    if (mapRows.some((m) => m.scoreA === "" || m.scoreB === "")) {
      setError("Preencha o placar de todos os mapas.");
      return;
    }
    const payloadPlayers: FinalizePlayer[] = rows.map((r) => ({
      userId: r.userId,
      name: r.name,
      team: r.team,
      kills: intOr0(r.kills),
      deaths: intOr0(r.deaths),
      assists: intOr0(r.assists),
      firstKills: intOr0(r.firstKills),
      adr: numOrNull(r.adr),
      kast: numOrNull(r.kast),
      rp: intOr0(r.rp),
      calculateElo: r.calculateElo,
    }));
    if (!confirm("Finalizar o mix? O ELO dos jogadores será atualizado e isso não pode ser desfeito por aqui.")) return;
    start(async () => {
      const result = await finalizeMix({ scheduleId, date, maps: payloadMaps, players: payloadPlayers });
      if (!result.ok) {
        setError(result.message);
        toast.error(result.message);
        return;
      }
      toast.success("Mix finalizado! ELO atualizado.");
      router.push(`/mixes/${result.matchId}`);
    });
  }

  const cell = "h-8 w-16 px-2 text-right tabular";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Mapas e placar"
          description={`Time A ${wins.A} × ${wins.B} Time B em mapas. Vitórias e derrotas são contadas por mapa.`}
        />
        <CardContent className="space-y-2">
          {mapRows.map((m, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <span className="w-14 text-xs font-semibold text-muted uppercase">Mapa {i + 1}</span>
              <Select
                aria-label={`Mapa ${i + 1}`}
                value={m.mapId}
                onChange={(e) => setMapRows((r) => r.map((x, j) => (j === i ? { ...x, mapId: e.target.value } : x)))}
                className="w-40"
              >
                {maps.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.name}
                  </option>
                ))}
              </Select>
              <TeamDot side="A" />
              <Input
                aria-label={`Placar do time A no mapa ${i + 1}`}
                inputMode="numeric"
                value={m.scoreA}
                onChange={(e) => setMapRows((r) => r.map((x, j) => (j === i ? { ...x, scoreA: e.target.value } : x)))}
                className="w-16 text-center tabular"
                placeholder="—"
              />
              <span className="text-subtle">×</span>
              <Input
                aria-label={`Placar do time B no mapa ${i + 1}`}
                inputMode="numeric"
                value={m.scoreB}
                onChange={(e) => setMapRows((r) => r.map((x, j) => (j === i ? { ...x, scoreB: e.target.value } : x)))}
                className="w-16 text-center tabular"
                placeholder="—"
              />
              <TeamDot side="B" />
              {mapRows.length > 1 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  aria-label={`Remover mapa ${i + 1}`}
                  onClick={() => setMapRows((r) => r.filter((_, j) => j !== i))}
                >
                  <Trash2 />
                </Button>
              )}
            </div>
          ))}
          {mapRows.length < 5 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMapRows((r) => [...r, { mapId: maps[0]?.id ?? "", scoreA: "", scoreB: "" }])}
            >
              <Plus /> Adicionar mapa
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          title="Estatísticas dos jogadores"
          description="Totais da série. RP é somado ao ELO atual (teto de 1600). MVP e lanterna são calculados automaticamente."
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-2/60 text-[11px] font-semibold tracking-wide text-muted uppercase">
              <tr>
                <th className="px-3 py-2 text-left">Jogador</th>
                <th className="px-2 py-2">Time</th>
                {["K", "A", "D", "FK", "ADR", "KAST", "RP"].map((h) => (
                  <th key={h} className="px-2 py-2 text-right">
                    {h}
                  </th>
                ))}
                <th className="px-2 py-2 text-right">ELO</th>
                <th className="px-3 py-2 text-center" title="Desmarque para não alterar o ELO deste jogador">
                  Calcular
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const after =
                  r.elo == null || !r.calculateElo ? r.elo : Math.min(Math.max(r.elo + intOr0(r.rp), 0), ELO_CAP);
                return (
                  <tr key={r.key} className="border-b border-border last:border-0">
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-1.5 font-medium whitespace-nowrap">
                        {r.userId ? (
                          r.name
                        ) : (
                          <Input
                            aria-label="Nome do convidado"
                            value={r.name}
                            onChange={(e) => update(r.key, { name: e.target.value })}
                            className="h-8 w-32"
                            placeholder="Convidado"
                          />
                        )}
                        {i === mvp && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-brand uppercase">
                            <Crown className="size-3" /> MVP
                          </span>
                        )}
                        {i === lanterna && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-loss uppercase">
                            <Flag className="size-3" /> Lanterna
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <Select
                        aria-label={`Time de ${r.name}`}
                        value={r.team}
                        onChange={(e) => update(r.key, { team: e.target.value as "A" | "B" })}
                        className="h-8 w-16 px-2"
                      >
                        <option value="A">A</option>
                        <option value="B">B</option>
                      </Select>
                    </td>
                    {(["kills", "assists", "deaths", "firstKills", "adr", "kast", "rp"] as const).map((field) => (
                      <td key={field} className="px-1 py-1.5">
                        <Input
                          aria-label={`${field} de ${r.name}`}
                          inputMode={field === "adr" || field === "kast" || field === "rp" ? "decimal" : "numeric"}
                          value={r[field]}
                          onChange={(e) => update(r.key, { [field]: e.target.value })}
                          className={cn(cell, field === "rp" && "w-20")}
                          placeholder={field === "adr" || field === "kast" ? "—" : "0"}
                        />
                      </td>
                    ))}
                    <td className="px-2 py-1.5 text-right text-xs whitespace-nowrap text-muted tabular">
                      {r.elo == null ? (
                        "—"
                      ) : (
                        <>
                          {r.elo} → <span className="font-semibold text-fg">{after}</span>
                          <span className="ml-1">(N{levelForElo(after ?? 0).level})</span>
                        </>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      <input
                        type="checkbox"
                        aria-label={`Calcular ELO de ${r.name}`}
                        checked={r.calculateElo}
                        disabled={!r.userId}
                        onChange={(e) => update(r.key, { calculateElo: e.target.checked })}
                        className="size-4 accent-brand"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="border-t border-border p-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              setRows((r) => [
                ...r,
                {
                  key: `guest-${r.length}-${Date.now()}`,
                  userId: null,
                  name: "",
                  team: "A",
                  elo: null,
                  kills: "",
                  deaths: "",
                  assists: "",
                  firstKills: "",
                  adr: "",
                  kast: "",
                  rp: "",
                  calculateElo: false,
                },
              ])
            }
          >
            <UserPlus /> Adicionar convidado (sem conta)
          </Button>
        </div>
      </Card>

      {error && (
        <p role="alert" className="flex items-center gap-2 text-sm text-loss">
          <AlertCircle className="size-4" /> {error}
        </p>
      )}
      <Button variant="primary" size="lg" className="w-full" disabled={saving} onClick={submit}>
        {saving && <Loader2 className="animate-spin" />} Finalizar mix e calcular ELO
      </Button>
    </div>
  );
}
