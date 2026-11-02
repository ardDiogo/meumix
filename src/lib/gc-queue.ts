/**
 * Fila dos mapas enviados pelo botão da GC, no navegador do admin
 * (localStorage): a aba que recebe guarda, a finalização lê. Falha aberta:
 * sem localStorage (aba anônima bloqueada), a fila fica vazia.
 */
import { GC_QUEUE_KEY, GC_QUEUE_MAX } from "./gc-bookmarklet";
import type { GcMap } from "./gc-api";

export interface GcQueued {
  map: GcMap;
  receivedAt: string;
}

export const readGcQueue = () => parseGcQueue(gcQueueSnapshot());

const EVENT = "meumix:gc-queue";

function write(list: GcQueued[]) {
  try {
    localStorage.setItem(GC_QUEUE_KEY, JSON.stringify(list));
    window.dispatchEvent(new Event(EVENT));
    return true;
  } catch {
    return false;
  }
}

/** Põe o mapa no fim da fila (a mesma partida enviada de novo substitui a anterior, no lugar dela). */
export function addToGcQueue(map: GcMap) {
  const list = readGcQueue();
  const at = map.gcMatchId ? list.findIndex((q) => q.map.gcMatchId === map.gcMatchId) : -1;
  const item = { map, receivedAt: new Date().toISOString() };
  if (at >= 0) list[at] = item;
  else list.push(item);
  return write(list.slice(-GC_QUEUE_MAX)) ? list.slice(-GC_QUEUE_MAX) : null;
}

export const removeFromGcQueue = (index: number) => write(readGcQueue().filter((_, i) => i !== index));
export const clearGcQueue = () => write([]);

/** Para useSyncExternalStore: muda nesta aba (evento próprio) e nas outras (storage). */
export function subscribeGcQueue(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVENT, cb);
  };
}
export function gcQueueSnapshot() {
  try {
    return localStorage.getItem(GC_QUEUE_KEY) ?? "[]";
  } catch {
    return "[]";
  }
}
export const parseGcQueue = (raw: string): GcQueued[] => {
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? (list as GcQueued[]).filter((q) => q?.map?.players) : [];
  } catch {
    return [];
  }
};
