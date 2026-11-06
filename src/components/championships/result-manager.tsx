"use client";

import { Copy, Download, Loader2, Play, Save, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { toast } from "sonner";
import { deleteMapResult, importGcMap, markLive, saveMapResult } from "@/app/(app)/campeonatos/results-actions";
import { seriesState } from "@/lib/championship-standings";
import { findMapName, parseGcPayload, type GcMap } from "@/lib/gc-api";
import { gcBookmarklet, GC_RETURN_KEY } from "@/lib/gc-bookmarklet";
import { gcQueueSnapshot, parseGcQueue, subscribeGcQueue } from "@/lib/gc-queue";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader } from "../ui/card";
import { Input, Label, Select, Textarea } from "../ui/input";

export type ResultMap = { order: number; mapId: string; home: number; away: number; gcMatchId: string | null };
type Result = { ok: boolean; message: string };

const mapIdFromHint = (hint: string | null) => {
  const name = findMapName(hint ?? "");
  return name ? `de_${name.toLowerCase()}` : "";
};

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<Result>, opts?: { confirm?: string; after?: () => void }) => {
    if (opts?.confirm && !confirm(opts.confirm)) return;
    start(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(r.message);
        opts?.after?.();
      } else toast.error(r.message);
      router.refresh();
    });
  };
  return [pending, run] as const;
}

/**
 * Resultado do jogo (quem organiza): mapas digitados ou importados da GC,
 * correção e "em andamento". O vencedor sai sozinho quando a série fecha.
 */
export function ResultManager({
  championshipId,
  matchId,
  bestOf,
  status,
  maps,
  homeName,
  awayName,
  mapOptions,
}: {
  championshipId: string;
  matchId: string;
  bestOf: number;
  status: string;
  maps: ResultMap[];
  homeName: string;
  awayName: string;
  mapOptions: { id: string; name: string }[];
}) {
  const [pending, run] = useRun();
  const state = seriesState(maps, bestOf);
  const nextOrder = maps.length + 1;
  const [edit, setEdit] = useState<ResultMap | null>(null);
  const [form, setForm] = useState({ mapId: "", home: "", away: "" });
  const editing = edit ?? (state.canAddMap ? { order: nextOrder, mapId: "", home: 0, away: 0, gcMatchId: null } : null);

  const submit = () => {
    if (!editing) return;
    run(
      () =>
        saveMapResult(championshipId, matchId, {
          order: editing.order,
          mapId: form.mapId,
          home: Number(form.home),
          away: Number(form.away),
        }),
      {
        after: () => {
          setEdit(null);
          setForm({ mapId: "", home: "", away: "" });
        },
      },
    );
  };

  return (
    <Card>
      <CardHeader
        title="Resultado"
        description={`MD${bestOf}: ${bestOf === 1 ? "um mapa decide" : `vence quem fizer ${state.need} mapas`}. A classificação atualiza sozinha.`}
        action={
          status !== "live" && status !== "finished" ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => run(() => markLive(championshipId, matchId))}
            >
              <Play /> Em andamento
            </Button>
          ) : undefined
        }
      />
      <CardContent className="space-y-4">
        {maps.length > 0 && (
          <ul className="divide-y divide-border rounded-md border border-border text-sm">
            {maps.map((m) => (
              <li key={m.order} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <span className="w-16 text-xs text-muted">Mapa {m.order}</span>
                <span className="flex-1 font-medium">
                  {mapOptions.find((o) => o.id === m.mapId)?.name ?? m.mapId}{" "}
                  <span className="tabular">
                    {m.home} × {m.away}
                  </span>
                  {m.gcMatchId && <span className="ml-2 text-xs text-subtle">GC #{m.gcMatchId}</span>}
                </span>
                {!m.gcMatchId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEdit(m);
                      setForm({ mapId: m.mapId, home: String(m.home), away: String(m.away) });
                    }}
                  >
                    Corrigir
                  </Button>
                )}
                {m.order === maps.length && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="px-2 text-muted hover:text-loss"
                    aria-label={`Apagar mapa ${m.order}`}
                    disabled={pending}
                    onClick={() =>
                      run(() => deleteMapResult(championshipId, matchId, m.order), {
                        confirm: `Apagar o mapa ${m.order}? O resultado do jogo é recalculado.`,
                      })
                    }
                  >
                    <Trash2 />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        {editing && (
          <form
            className="grid gap-3 sm:grid-cols-[1fr_6rem_6rem_auto] sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <div>
              <Label htmlFor="res-map">{edit ? `Corrigir mapa ${edit.order}` : `Mapa ${nextOrder}`}</Label>
              <Select
                id="res-map"
                value={form.mapId}
                onChange={(e) => setForm((f) => ({ ...f, mapId: e.target.value }))}
              >
                <option value="">Escolha o mapa</option>
                {mapOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="res-home" className="truncate">
                {homeName}
              </Label>
              <Input
                id="res-home"
                type="number"
                min={0}
                max={99}
                value={form.home}
                onChange={(e) => setForm((f) => ({ ...f, home: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="res-away" className="truncate">
                {awayName}
              </Label>
              <Input
                id="res-away"
                type="number"
                min={0}
                max={99}
                value={form.away}
                onChange={(e) => setForm((f) => ({ ...f, away: e.target.value }))}
              />
            </div>
            <div className="flex gap-2">
              <Button
                type="submit"
                variant="primary"
                disabled={pending || !form.mapId || form.home === "" || form.away === ""}
              >
                {pending ? <Loader2 className="animate-spin" /> : <Save />} Salvar
              </Button>
              {edit && (
                <Button variant="ghost" onClick={() => setEdit(null)}>
                  Cancelar
                </Button>
              )}
            </div>
          </form>
        )}
        {state.winner && !edit && (
          <p className="text-sm text-muted">
            Série decidida ({state.home} × {state.away}). Para corrigir, use “Corrigir” ou apague o último mapa.
          </p>
        )}

        {state.canAddMap && !edit && (
          <GcImport
            championshipId={championshipId}
            matchId={matchId}
            homeName={homeName}
            awayName={awayName}
            mapOptions={mapOptions}
          />
        )}
      </CardContent>
    </Card>
  );
}

const EMPTY = "[]";

/**
 * Botão da GC para os favoritos (o mesmo dos mixes) e a volta para este jogo
 * depois de enviar. O React não aceita "javascript:" no href: vai direto no DOM.
 */
function BookmarkletInstall() {
  const link = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    link.current?.setAttribute("href", gcBookmarklet(window.location.origin));
    try {
      localStorage.setItem(GC_RETURN_KEY, window.location.pathname);
    } catch {}
  }, []);
  return (
    <details className="text-xs text-muted">
      <summary className="cursor-pointer">Ainda não tem o botão? Instale nos favoritos</summary>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <a
          ref={link}
          onClick={(e) => {
            e.preventDefault();
            toast.info("Arraste este botão para a barra de favoritos e use-o na página da partida na GC.");
          }}
          className="inline-flex h-8 cursor-grab items-center gap-1.5 rounded-md bg-brand px-3 text-xs font-semibold text-black"
        >
          <Download className="size-3.5" /> Enviar ao MeuMix
        </a>
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            navigator.clipboard
              .writeText(gcBookmarklet(window.location.origin))
              .then(() => toast.success("Código copiado: crie um favorito e cole no endereço (URL)."))
              .catch(() => toast.error("Não foi possível copiar."))
          }
        >
          <Copy /> Copiar código
        </Button>
        <span className="w-full text-subtle">Arraste para a barra de favoritos (Ctrl+Shift+B mostra a barra).</span>
      </div>
    </details>
  );
}

/** Importar da GC: partidas da fila do "Enviar ao MeuMix" (neste navegador) ou o JSON colado. */
function GcImport({
  championshipId,
  matchId,
  homeName,
  awayName,
  mapOptions,
}: {
  championshipId: string;
  matchId: string;
  homeName: string;
  awayName: string;
  mapOptions: { id: string; name: string }[];
}) {
  const [pending, run] = useRun();
  const raw = useSyncExternalStore(subscribeGcQueue, gcQueueSnapshot, () => EMPTY);
  const queue = parseGcQueue(raw);
  const [picked, setPicked] = useState<GcMap | null>(null);
  const [mapId, setMapId] = useState("");
  const [side, setSide] = useState<"" | "A" | "B">("");
  const [paste, setPaste] = useState("");

  const choose = (m: GcMap) => {
    setPicked(m);
    setMapId(mapIdFromHint(m.mapHint));
    setSide("");
  };
  const fromPaste = () => {
    try {
      const r = parseGcPayload(JSON.parse(paste));
      if (!r.ok) return void toast.error(r.message);
      choose(r.map);
    } catch {
      toast.error("JSON inválido.");
    }
  };

  return (
    <div className="space-y-3 rounded-md border border-border bg-surface-2/40 p-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Download className="size-4 text-brand" aria-hidden /> Importar da GC
      </div>
      <p className="text-xs text-muted">
        Na página da partida na GC, clique em <span className="text-fg">Enviar ao MeuMix</span> (o mesmo botão dos
        mixes). Ela aparece aqui; os jogadores são ligados pelo apelido da GC ou pela Steam. A lista guarda as últimas
        20 partidas enviadas neste navegador: dá para enviar a rodada inteira e importar depois, jogo a jogo.
      </p>
      <BookmarkletInstall />
      {queue.length > 0 ? (
        <ul className="space-y-1.5">
          {queue
            .slice()
            .reverse()
            .map((q) => (
              <li key={q.map.gcMatchId}>
                <button
                  type="button"
                  onClick={() => choose(q.map)}
                  className={`w-full rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                    picked?.gcMatchId === q.map.gcMatchId
                      ? "border-brand bg-brand/10"
                      : "border-border hover:border-border-strong"
                  }`}
                >
                  GC #{q.map.gcMatchId} · {findMapName(q.map.mapHint) ?? "mapa ?"} · time A {q.map.scoreA} ×{" "}
                  {q.map.scoreB} time B
                </button>
              </li>
            ))}
        </ul>
      ) : (
        <p className="text-xs text-subtle">Nenhuma partida da GC recebida neste navegador.</p>
      )}
      <details className="text-xs text-muted">
        <summary className="cursor-pointer">Colar o JSON da GC</summary>
        <div className="mt-2 space-y-2">
          <Textarea
            rows={3}
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            placeholder='{"v":1,"id":"…","stats":{…}}'
          />
          <Button variant="outline" size="sm" disabled={!paste.trim()} onClick={fromPaste}>
            Ler JSON
          </Button>
        </div>
      </details>
      {picked && (
        <div className="grid gap-3 border-t border-border pt-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div>
            <Label htmlFor="gc-map">Mapa</Label>
            <Select id="gc-map" value={mapId} onChange={(e) => setMapId(e.target.value)}>
              <option value="">Escolha o mapa</option>
              {mapOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="gc-side">Lado do {homeName}</Label>
            <Select id="gc-side" value={side} onChange={(e) => setSide(e.target.value as "" | "A" | "B")}>
              <option value="">Descobrir pelo elenco</option>
              <option value="A">
                Time A da GC ({picked.scoreA}) = {homeName}
              </option>
              <option value="B">
                Time B da GC ({picked.scoreB}) = {homeName}
              </option>
            </Select>
          </div>
          <Button
            variant="primary"
            disabled={pending || !mapId}
            onClick={() =>
              run(() => importGcMap(championshipId, matchId, picked, mapId, side || null), {
                after: () => setPicked(null),
              })
            }
          >
            {pending && <Loader2 className="animate-spin" />} Importar
          </Button>
          <p className="text-xs text-subtle sm:col-span-3">
            {homeName} × {awayName}: o placar é gravado do ponto de vista do mandante.
          </p>
        </div>
      )}
    </div>
  );
}
