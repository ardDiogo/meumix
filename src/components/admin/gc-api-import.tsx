"use client";

import { Bookmark, ClipboardPaste, Copy, Download, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { aliasKey } from "@/lib/alias";
import { gcAlias, parseGcPayload, toOcrMap, type GcMap } from "@/lib/gc-api";
import { gcBookmarklet, GC_RETURN_KEY } from "@/lib/gc-bookmarklet";
import { mapIdFromName, mergeMaps, type MergedResult } from "@/lib/gc-ocr";
import { addToGcQueue, clearGcQueue, gcQueueSnapshot, parseGcQueue, subscribeGcQueue } from "@/lib/gc-queue";
import { Button } from "../ui/button";
import { GcQueueList } from "./gc-queue-list";

/**
 * Importação pela página da partida na GC: o botão "Enviar ao MeuMix" (favorito)
 * manda cada mapa para a fila; aqui o admin confere os mapas e usa todos de uma
 * vez. No celular, dá para colar o JSON da requisição `stats`.
 */
export function GcApiImport({
  maps,
  aliases,
  steamIds,
  onImported,
}: {
  maps: { id: string; name: string }[];
  /** Apelidos salvos (inclui os IDs da GC já ligados: "gc:123"). */
  aliases: Record<string, string>;
  /** SteamID64 → jogador (quem vinculou a Steam é reconhecido já na primeira vez). */
  steamIds: Record<string, string>;
  onImported: (
    result: MergedResult,
    links: Record<string, string>,
    gcMaps: { map: GcMap; mapId: string }[],
    rpMissing: boolean,
  ) => void;
}) {
  const raw = useSyncExternalStore(subscribeGcQueue, gcQueueSnapshot, () => "[]");
  const queue = useMemo(() => parseGcQueue(raw), [raw]);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [paste, setPaste] = useState("");
  const link = useRef<HTMLAnchorElement>(null);

  // O React não aceita "javascript:" no href: o link do favorito vai direto no DOM.
  useEffect(() => {
    link.current?.setAttribute("href", gcBookmarklet(window.location.origin));
    try {
      localStorage.setItem(GC_RETURN_KEY, window.location.pathname + window.location.search);
    } catch {}
  }, []);

  const keyOf = (i: number) => `${queue[i]?.map.gcMatchId}-${i}`;
  const mapOf = (i: number) => choice[keyOf(i)] ?? mapIdFromName(queue[i]?.map.mapHint ?? null, maps) ?? "";

  function addPasted() {
    let parsed;
    try {
      parsed = parseGcPayload(JSON.parse(paste));
    } catch {
      toast.error("Isso não é um JSON válido. Copie a resposta inteira da requisição stats.");
      return;
    }
    if (!parsed.ok) {
      toast.error(parsed.message);
      return;
    }
    if (!addToGcQueue(parsed.map)) {
      toast.error("O navegador não deixou guardar o mapa.");
      return;
    }
    setPaste("");
    toast.success(`Mapa adicionado: ${parsed.map.scoreA} × ${parsed.map.scoreB}.`);
  }

  function applyQueue() {
    const chosen = queue.map((q, i) => ({ map: q.map, mapId: mapOf(i) }));
    if (chosen.some((c) => !c.mapId)) {
      toast.error("Escolha o mapa de cada partida recebida.");
      return;
    }
    const name = (id: string) => maps.find((m) => m.id === id)?.name ?? id;
    const result = mergeMaps(chosen.map((c) => toOcrMap(c.map, name(c.mapId))));
    // ID da GC já ligado a um jogador: vínculo garantido (vale mais que o nick).
    const links: Record<string, string> = {};
    for (const c of chosen)
      for (const p of c.map.players) {
        const userId = aliases[aliasKey(gcAlias(p.gcId))] ?? (p.steamId ? steamIds[p.steamId] : undefined);
        if (userId) links[p.nick] = userId;
      }
    onImported(
      result,
      links,
      chosen,
      chosen.some((c) => c.map.players.some((p) => p.rp == null)),
    );
    toast.success(
      `${chosen.length} ${chosen.length > 1 ? "mapas importados" : "mapa importado"}. Confira antes de finalizar.`,
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-surface-2/40 p-4">
        <div className="mb-2 flex items-center gap-2 font-semibold">
          <Bookmark className="size-4 text-brand" /> Botão da GC (só uma vez)
        </div>
        <p className="mb-3 text-sm text-muted">
          Arraste o botão abaixo para a barra de favoritos do navegador (Ctrl+Shift+B mostra a barra). Depois, em cada
          mapa do mix, abra a partida na GC logado e clique no favorito: o mapa chega aqui sozinho.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {/* Arrastar para os favoritos; clicar aqui não faz nada. */}
          <a
            ref={link}
            onClick={(e) => {
              e.preventDefault();
              toast.info("Arraste este botão para a barra de favoritos e use-o na página da partida na GC.");
            }}
            className="inline-flex h-9 cursor-grab items-center gap-2 rounded-md bg-brand px-3 text-sm font-semibold text-black"
          >
            <Download className="size-4" /> Enviar ao MeuMix
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
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-sm font-semibold">Mapas recebidos ({queue.length})</span>
          {queue.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted hover:text-loss"
              onClick={() => confirm("Tirar todos os mapas recebidos?") && clearGcQueue()}
            >
              <Trash2 /> Limpar
            </Button>
          )}
        </div>
        <GcQueueList
          queue={queue}
          maps={maps}
          mapOf={mapOf}
          onMapChange={(i, id) => setChoice((c) => ({ ...c, [keyOf(i)]: id }))}
        />
        {queue.length > 0 && (
          <Button variant="primary" className="mt-3 w-full" onClick={applyQueue}>
            Usar {queue.length > 1 ? `os ${queue.length} mapas recebidos` : "o mapa recebido"}
          </Button>
        )}
      </div>

      <details className="rounded-md border border-border px-4 py-3 text-sm">
        <summary className="cursor-pointer font-medium">Sem o botão? Colar o JSON da partida</summary>
        <p className="mt-2 text-muted">
          Na página da partida na GC: F12 → Network → Fetch/XHR → F5 → clique na linha <code>stats</code> → Response →
          copie tudo e cole aqui. Os nicks aparecem como “GC 123” até você ligar cada um ao jogador.
        </p>
        <textarea
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          rows={4}
          placeholder='{"status":"pronto","scoreboard":{…}}'
          className="mt-2 w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-xs"
        />
        <Button variant="outline" size="sm" className="mt-2" disabled={!paste.trim()} onClick={addPasted}>
          <ClipboardPaste /> Adicionar mapa
        </Button>
      </details>
    </div>
  );
}
