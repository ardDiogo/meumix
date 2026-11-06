"use client";

import { ArrowLeft, CheckCircle2, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { parseGcPayload, prettyMap } from "@/lib/gc-api";
import { GC_RETURN_KEY } from "@/lib/gc-bookmarklet";
import { addToGcQueue, gcQueueSnapshot, parseGcQueue, subscribeGcQueue } from "@/lib/gc-queue";
import { Button } from "../ui/button";
import { GcQueueList } from "./gc-queue-list";

/**
 * Aba aberta pelo botão "Enviar ao MeuMix": lê os dados do endereço (#…),
 * confere e põe o mapa na fila da finalização. O endereço é limpo em seguida.
 */
export function GcReceiver() {
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [back, setBack] = useState<string | null>(null);
  const raw = useSyncExternalStore(subscribeGcQueue, gcQueueSnapshot, () => "[]");
  const queue = useMemo(() => parseGcQueue(raw), [raw]);

  useEffect(() => {
    let result: { ok: boolean; message: string } | null = null;
    const hash = window.location.hash.slice(1);
    if (hash) {
      try {
        const parsed = parseGcPayload(JSON.parse(decodeURIComponent(hash)));
        if (!parsed.ok) result = { ok: false, message: parsed.message };
        else if (!addToGcQueue(parsed.map))
          result = { ok: false, message: "O navegador não deixou guardar o mapa (armazenamento bloqueado)." };
        else
          result = {
            ok: true,
            message: `Partida ${parsed.map.gcMatchId} recebida: ${parsed.map.scoreA} × ${parsed.map.scoreB}${
              parsed.map.mapHint ? ` em ${prettyMap(parsed.map.mapHint)}` : ""
            }.`,
          };
      } catch {
        result = { ok: false, message: "Os dados chegaram incompletos. Clique no botão de novo na página da GC." };
      }
      history.replaceState(null, "", window.location.pathname);
    }
    let url: string | null = null;
    try {
      url = localStorage.getItem(GC_RETURN_KEY);
    } catch {}
    // Só volta para a finalização do mix ou para um jogo de campeonato do próprio site.
    if (!url?.startsWith("/admin/finalizar?") && !/^\/campeonatos\/[a-z0-9-]+\/jogos\/[0-9a-f-]{36}$/.test(url ?? ""))
      url = null;
    // Leitura única do endereço e do armazenamento ao abrir a aba.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStatus(result);
    setBack(url);
  }, []);

  return (
    <div className="space-y-4">
      {status && (
        <div
          className={
            status.ok
              ? "flex items-start gap-2 rounded-md border border-win/30 bg-win/10 px-4 py-3 text-sm text-win"
              : "flex items-start gap-2 rounded-md border border-loss/30 bg-loss/10 px-4 py-3 text-sm text-loss"
          }
        >
          {status.ok ? (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          ) : (
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          )}
          <span>{status.message}</span>
        </div>
      )}
      <GcQueueList queue={queue} />
      <p className="text-sm text-muted">
        Envie os outros mapas do mix pela página de cada partida na GC. Depois, na finalização do mix, clique em{" "}
        <span className="font-semibold text-fg">Usar os mapas recebidos</span>.
      </p>
      <Button variant="primary" asChild>
        <Link href={back ?? "/admin"}>
          <ArrowLeft />{" "}
          {back
            ? back.startsWith("/campeonatos/")
              ? "Voltar para o jogo do campeonato"
              : "Voltar para a finalização"
            : "Ir para o painel"}
        </Link>
      </Button>
    </div>
  );
}
