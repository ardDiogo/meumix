"use client";

import { AlertTriangle, Loader2, LogIn, UserMinus, UserPlus } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { joinMix, leaveMix } from "@/app/(app)/inscricoes/actions";
import { useServerClock, useTick } from "@/hooks/use-server-clock";
import { isLateLeave, STRIKES_TO_SUSPEND, SUSPENSION_MIXES } from "@/lib/strikes";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "../ui/dialog";

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

/** A barra enche ao longo da semana antes da abertura (o mix é semanal). */
const BAR_WINDOW_MS = 7 * 86_400_000;

/**
 * Contagem até a abertura das inscrições: o botão cinza com o tempo e uma linha
 * laranja fina embaixo que enche aos poucos. Nas últimas 24h ela engrossa e brilha.
 */
function OpeningBar({ opensAt, now, children }: { opensAt: number; now: number; children: React.ReactNode }) {
  const left = opensAt - now;
  const pct = Math.min(100, Math.max(0, (1 - left / BAR_WINDOW_MS) * 100));
  const today = left <= 86_400_000;
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      aria-label="Tempo até as inscrições abrirem"
      className="relative flex h-10 w-full items-center justify-center overflow-hidden rounded-md border border-border bg-surface-2 text-sm font-medium text-muted tabular"
    >
      <span className="relative px-3">{children}</span>
      <div className={cn("absolute inset-x-0 bottom-0 bg-surface-3", today ? "h-1.5" : "h-1")} aria-hidden>
        <div
          className={cn(
            "relative h-full overflow-hidden bg-brand transition-[width] duration-1000 ease-linear",
            today && "shadow-[0_0_10px_1px] shadow-brand/70",
          )}
          style={{ width: `${pct}%` }}
        >
          <div className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/50 to-transparent" />
        </div>
      </div>
    </div>
  );
}

export function JoinButton({
  scheduleId,
  date,
  loggedIn,
  registered,
  opensAt,
  eventAt,
  penaltyDelay,
  classified = false,
  strikes = 0,
  starterDelay = 0,
  lateLeaveRule = true,
  suspension = null,
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
  /** Está entre os classificados (sair a menos de 3h conta falta). */
  classified?: boolean;
  /** Faltas ativas na liga do mix. */
  strikes?: number;
  /** Atraso (s) por não ser titular da liga: abre depois dos titulares. */
  starterDelay?: number;
  /** Regra da saída tardia ligada. */
  lateLeaveRule?: boolean;
  /** Suspensão em andamento: só entra como reserva. */
  suspension?: { mixes: number; served: number } | null;
  /** Inscreve sozinho ao abrir a página, se as inscrições já estiverem abertas (link de 1 toque). */
  autoJoin?: boolean;
  /** Para onde voltar depois do login. */
  loginNext?: string;
}) {
  const { synced, now } = useServerClock();
  useTick(1000);
  const [processing, setProcessing] = useState(false);
  const [leaving, startLeave] = useTransition();
  const [confirmLeave, setConfirmLeave] = useState(false);
  const inFlight = useRef(false);

  const serverNow = now();
  const releaseAt = opensAt + ((penaltyDelay ?? 0) + starterDelay) * 1000;
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
      // Só perto da abertura e com a aba à vista (cada ping gasta CPU do servidor): a cada 1 min
      // nos 15 min antes, a cada 5s nos últimos 2 min; fora disso, nada.
      if (document.visibilityState !== "visible" || toOpen <= 0 || toOpen > 15 * 60_000) return;
      const every = toOpen > 120_000 ? 60_000 : 5_000;
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
    if (started) {
      return (
        <Button variant="secondary" size="lg" className="w-full" disabled>
          <UserMinus /> Inscrição confirmada
        </Button>
      );
    }
    // Sair do mix pede confirmação: quem sai perde a vaga e, se voltar, entra no fim da lista.
    return (
      <Dialog open={confirmLeave} onOpenChange={setConfirmLeave}>
        <DialogTrigger asChild>
          <Button variant="secondary" size="lg" className="w-full" disabled={leaving}>
            {leaving ? <Loader2 className="animate-spin" /> : <UserMinus />} Cancelar minha inscrição
          </Button>
        </DialogTrigger>
        <DialogContent
          title="Deseja sair do mix?"
          description="Você perde a sua vaga na lista. Se entrar de novo, volta para o fim da fila e pode ficar como reserva."
        >
          {lateLeaveRule && isLateLeave(classified, eventAt, serverNow) && (
            <div className="flex gap-2 rounded-md border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p>
                Faltam menos de 3h. Sair agora conta <strong>1 falta</strong> (você tem {strikes}/{STRIKES_TO_SUSPEND}
                ). Com {STRIKES_TO_SUSPEND} faltas, você fica <strong>{SUSPENSION_MIXES} mixes só como reserva</strong>.
              </p>
            </div>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <DialogClose asChild>
              <Button variant="secondary">Continuar no mix</Button>
            </DialogClose>
            <Button
              variant="danger"
              disabled={leaving}
              onClick={() =>
                startLeave(async () => {
                  const r = await leaveMix(scheduleId, date);
                  setConfirmLeave(false);
                  if (r.ok) toast.success(r.message);
                  else toast.error(r.message);
                })
              }
            >
              {leaving ? <Loader2 className="animate-spin" /> : <UserMinus />} Sim, sair do mix
            </Button>
          </div>
        </DialogContent>
      </Dialog>
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

  // Não titular: a lista já abriu para os titulares; a dele abre depois do atraso da liga.
  if (msToOpen > EARLY_TOLERANCE_MS && starterDelay > 0 && serverNow >= opensAt - EARLY_TOLERANCE_MS) {
    const at = new Date(releaseAt).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Sao_Paulo",
    });
    return (
      <div className="space-y-2">
        <Button variant="secondary" size="lg" className="w-full tabular" disabled>
          Titulares primeiro — sua inscrição abre em {countdown(msToOpen)}
        </Button>
        <p className="text-xs text-muted">Inscrição para quem não é titular a partir das {at}.</p>
        <SuspensionNote suspension={suspension} />
      </div>
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
    const button = (
      <OpeningBar opensAt={opensAt} now={serverNow}>
        Inscrições abrem em {countdown(opensAt - serverNow)}
        {penaltyDelay ? ` (+${penaltyDelay}s de punição)` : ""}
        {starterDelay ? " para os titulares" : ""}
      </OpeningBar>
    );
    if (suspension || starterDelay)
      return (
        <div className="space-y-2">
          {button}
          {starterDelay > 0 && (
            <p className="text-xs text-muted">
              Você não é titular desta liga: sua inscrição abre às{" "}
              {new Date(releaseAt).toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
                timeZone: "America/Sao_Paulo",
              })}
              .
            </p>
          )}
          <SuspensionNote suspension={suspension} />
        </div>
      );
    return button;
  }

  return (
    <div className="space-y-2">
      <Button
        variant="primary"
        size="lg"
        className="w-full"
        onClick={() => {
          writeQueue({ scheduleId, date, device: detectDevice(), attempt: 0, nextAt: 0 });
          void attempt();
        }}
      >
        <UserPlus /> {suspension ? "Entrar como reserva" : "Quero participar"}
      </Button>
      <SuspensionNote suspension={suspension} />
    </div>
  );
}

function SuspensionNote({ suspension }: { suspension: { mixes: number; served: number } | null }) {
  if (!suspension) return null;
  const left = suspension.mixes - suspension.served;
  return (
    <p className="flex items-start gap-1.5 text-xs text-loss">
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      Suspenso por faltas: você só entra como reserva (atrás de todos) por mais {left} {left === 1 ? "mix" : "mixes"}.
    </p>
  );
}
