"use client";

import { Loader2, LogIn, UserMinus, UserPlus } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { joinMix, leaveMix } from "@/app/(app)/inscricoes/actions";
import { useServerClock, useTick } from "@/hooks/use-server-clock";
import { Button } from "../ui/button";

/* Regras: docs/regras-do-mix.md, seção 2. */
const RETRY_DELAYS_S = [1, 1, 2, 2, 3, 3, 5, 5, 10, 10];
const FALLBACK_RETRY_MS = 5000;
const QUEUE_KEY = "mm-join-queue";
const EARLY_TOLERANCE_MS = 1000;

interface QueueItem {
  scheduleId: string;
  date: string;
  device: "mobile" | "desktop";
  attempt: number;
  nextAt: number;
}

const readQueue = (): QueueItem | null => {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "null") as QueueItem | null;
  } catch {
    return null;
  }
};
const writeQueue = (item: QueueItem | null) => {
  try {
    if (item) localStorage.setItem(QUEUE_KEY, JSON.stringify(item));
    else localStorage.removeItem(QUEUE_KEY);
  } catch {
    // Armazenamento indisponível: a tentativa atual continua funcionando.
  }
};

const detectDevice = (): "mobile" | "desktop" =>
  /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ? "mobile" : "desktop";

function countdown(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const d = Math.floor(s / 86_400);
  const hh = String(Math.floor((s % 86_400) / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return d > 0 ? `${d}d ${hh}:${mm}:${ss}` : `${hh}:${mm}:${ss}`;
}

export function JoinButton({
  scheduleId,
  date,
  loggedIn,
  registered,
  opensAt,
  eventAt,
  penaltyDelay,
  autoJoin = false,
  loginNext = "/dashboard",
}: {
  scheduleId: string;
  date: string;
  loggedIn: boolean;
  registered: boolean;
  opensAt: number;
  eventAt: number;
  /** Atraso (s) de uma punição ativa: a inscrição libera em opensAt + atraso. */
  penaltyDelay: number | null;
  /** Inscreve sozinho ao abrir a página, se as inscrições já estiverem abertas (link de 1 toque). */
  autoJoin?: boolean;
  /** Para onde voltar depois do login. */
  loginNext?: string;
}) {
  const { synced, now } = useServerClock();
  useTick(1000);
  const [processing, setProcessing] = useState(false);
  const [leaving, startLeave] = useTransition();
  const inFlight = useRef(false);

  const serverNow = now();
  const releaseAt = opensAt + (penaltyDelay ?? 0) * 1000;
  const msToOpen = releaseAt - serverNow;
  const penaltyRunning = !!penaltyDelay && serverNow >= opensAt - EARLY_TOLERANCE_MS;
  const started = serverNow >= eventAt;

  /* ---------------- Fila de nova tentativa (sobrevive a recarregar) ---------------- */
  const attempt = useCallback(async () => {
    const item = readQueue();
    if (!item || item.scheduleId !== scheduleId || item.date !== date || inFlight.current) return;
    if (Date.now() < item.nextAt) return;
    inFlight.current = true;
    setProcessing(true);
    let result: Awaited<ReturnType<typeof joinMix>> | null = null;
    try {
      result = await joinMix(scheduleId, date, item.device, Date.now());
    } catch {
      result = null; // Falha de rede/servidor: tenta de novo.
    }
    inFlight.current = false;

    if (result?.ok) {
      writeQueue(null);
      setProcessing(false);
      toast.success(result.message);
      return;
    }
    const retryable = !result || result.code === "error";
    if (!retryable || item.attempt + 1 >= RETRY_DELAYS_S.length) {
      writeQueue(null);
      setProcessing(false);
      toast.error(result?.message ?? "Não foi possível concluir a inscrição. Verifique sua conexão.");
      return;
    }
    writeQueue({ ...item, attempt: item.attempt + 1, nextAt: Date.now() + RETRY_DELAYS_S[item.attempt]! * 1000 });
  }, [scheduleId, date]);

  // Retoma uma fila salva, tenta ao reconectar, ao voltar para a aba e a cada 5s como reserva.
  useEffect(() => {
    // Fila salva só existe no navegador: restaura depois da montagem.
    const restore = setTimeout(() => {
      const queued = readQueue();
      if (queued?.scheduleId !== scheduleId || queued.date !== date) return;
      if (registered) writeQueue(null);
      else setProcessing(true);
    }, 0);
    const tryNow = () => {
      const q = readQueue();
      if (q) writeQueue({ ...q, nextAt: 0 });
      void attempt();
    };
    const onVisible = () => document.visibilityState === "visible" && tryNow();
    const tick = setInterval(() => void attempt(), 250);
    const fallback = setInterval(tryNow, FALLBACK_RETRY_MS);
    window.addEventListener("online", tryNow);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(restore);
      clearInterval(tick);
      clearInterval(fallback);
      window.removeEventListener("online", tryNow);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [attempt, scheduleId, date, registered]);

  /* ----- Link de 1 toque: só inscreve sozinho se já estava aberto quando a página carregou ----- */
  const autoDecided = useRef(false);
  useEffect(() => {
    if (!autoJoin || autoDecided.current || !synced || !loggedIn) return;
    autoDecided.current = true;
    if (registered || started || readQueue() || releaseAt - now() > EARLY_TOLERANCE_MS) return;
    // A fila é processada pelo intervalo de 250 ms acima.
    writeQueue({ scheduleId, date, device: detectDevice(), attempt: 0, nextAt: 0 });
  }, [autoJoin, synced, loggedIn, registered, started, releaseAt, now, scheduleId, date]);

  /* ----- Preparação para a abertura: renova a sessão e "acorda" o servidor ----- */
  const lastPing = useRef(0);
  useEffect(() => {
    if (!loggedIn || registered || started) return;
    const id = setInterval(() => {
      const toOpen = opensAt - now();
      // 5 min longe da abertura; a cada 5s nos últimos 2 min; a cada 45s com o mix aberto.
      const every = toOpen > 120_000 ? 300_000 : toOpen > 0 ? 5_000 : 45_000;
      if (Date.now() - lastPing.current >= every) {
        lastPing.current = Date.now();
        void fetch("/api/time", { cache: "no-store" }).catch(() => undefined);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [loggedIn, registered, started, opensAt, now]);

  /* --------------------------------- Estados --------------------------------- */
  if (!loggedIn) {
    return (
      <Button variant="primary" size="lg" className="w-full" asChild>
        <Link href={`/entrar?next=${encodeURIComponent(loginNext)}`}>
          <LogIn /> Entre ou cadastre-se para participar
        </Link>
      </Button>
    );
  }

  if (registered) {
    return (
      <Button
        variant="secondary"
        size="lg"
        className="w-full"
        disabled={leaving || started}
        onClick={() =>
          startLeave(async () => {
            const r = await leaveMix(scheduleId, date);
            if (r.ok) toast.success(r.message);
            else toast.error(r.message);
          })
        }
      >
        {leaving ? <Loader2 className="animate-spin" /> : <UserMinus />}
        {started ? "Inscrição confirmada" : "Cancelar minha inscrição"}
      </Button>
    );
  }

  if (processing) {
    return (
      <Button variant="primary" size="lg" className="w-full" disabled>
        <Loader2 className="animate-spin" /> Processando…
      </Button>
    );
  }

  if (!synced) {
    return (
      <Button variant="secondary" size="lg" className="w-full" disabled>
        <Loader2 className="animate-spin" /> Sincronizando relógio…
      </Button>
    );
  }

  if (started) {
    return (
      <Button variant="secondary" size="lg" className="w-full" disabled>
        Inscrições encerradas
      </Button>
    );
  }

  if (msToOpen > EARLY_TOLERANCE_MS && penaltyRunning) {
    return (
      <Button variant="secondary" size="lg" className="w-full border-loss/40 text-loss tabular" disabled>
        Punição ativa — sua inscrição libera em {countdown(msToOpen)}
      </Button>
    );
  }

  if (msToOpen > EARLY_TOLERANCE_MS) {
    return (
      <Button variant="secondary" size="lg" className="w-full tabular" disabled>
        Inscrições abrem em {countdown(opensAt - serverNow)}
        {penaltyDelay ? ` (+${penaltyDelay}s de punição)` : ""}
      </Button>
    );
  }

  return (
    <Button
      variant="primary"
      size="lg"
      className="w-full"
      onClick={() => {
        writeQueue({ scheduleId, date, device: detectDevice(), attempt: 0, nextAt: 0 });
        void attempt();
      }}
    >
      <UserPlus /> Quero participar
    </Button>
  );
}
