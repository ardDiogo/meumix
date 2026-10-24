"use client";

import { Bell, BellOff, Loader2, Send, Share } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  deletePushSubscription,
  getPushTopics,
  savePushSubscription,
  sendTestPush,
  updatePushTopics,
} from "@/app/(app)/configuracoes/push-actions";
import { currentSubscription, pushSupport, subscribePush, type PushSupport } from "@/lib/push-client";
import { ALL_TOPICS, PUSH_TOPICS, type PushTopic } from "@/lib/push-topics";
import { Button } from "../ui/button";
import { Switch } from "../ui/switch";

type State =
  | { kind: "loading" }
  | { kind: "blocked"; reason: Exclude<PushSupport, "supported"> }
  | { kind: "off" }
  | { kind: "on"; endpoint: string; topics: PushTopic[] };

/** Liga/desliga os avisos neste aparelho e escolhe os tipos de aviso. */
export function PushSettings({ publicKey }: { publicKey: string | null }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [pending, start] = useTransition();

  useEffect(() => {
    let alive = true;
    (async () => {
      const support = pushSupport();
      if (support !== "supported") return alive && setState({ kind: "blocked", reason: support });
      const sub = await currentSubscription().catch(() => null);
      const topics = sub ? await getPushTopics(sub.endpoint) : null;
      if (!alive) return;
      // Aparelho inscrito no navegador mas não no servidor (ex.: outra conta): conta como desligado.
      setState(sub && topics ? { kind: "on", endpoint: sub.endpoint, topics } : { kind: "off" });
    })();
    return () => {
      alive = false;
    };
  }, []);

  const enable = () =>
    start(async () => {
      try {
        const sub = await subscribePush(publicKey!);
        const r = await savePushSubscription(sub.toJSON() as Parameters<typeof savePushSubscription>[0]);
        if (!r.ok) throw new Error(r.message);
        toast.success(r.message);
        setState({ kind: "on", endpoint: sub.endpoint, topics: ALL_TOPICS });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Não foi possível ativar os avisos.");
        if (pushSupport() === "denied") setState({ kind: "blocked", reason: "denied" });
      }
    });

  const disable = (endpoint: string) =>
    start(async () => {
      const sub = await currentSubscription().catch(() => null);
      await sub?.unsubscribe().catch(() => {});
      const r = await deletePushSubscription(endpoint);
      toast.success(r.message);
      setState({ kind: "off" });
    });

  const toggleTopic = (topic: PushTopic, on: boolean) => {
    if (state.kind !== "on") return;
    const topics = on ? [...state.topics, topic] : state.topics.filter((t) => t !== topic);
    setState({ ...state, topics });
    start(async () => {
      const r = await updatePushTopics(state.endpoint, topics);
      if (!r.ok) toast.error(r.message);
    });
  };

  const test = () =>
    start(async () => {
      const r = await sendTestPush();
      if (r.ok) toast.success(r.message);
      else toast.error(r.message);
    });

  if (!publicKey) {
    return <p className="text-sm text-muted">Os avisos ainda não foram configurados pelo administrador.</p>;
  }
  if (state.kind === "loading") {
    return <Loader2 className="size-4 animate-spin text-muted" aria-label="Carregando" />;
  }
  if (state.kind === "blocked") {
    return (
      <p className="text-sm text-muted">
        {state.reason === "ios-install" ? (
          <>
            No iPhone, os avisos só funcionam com o MeuMix instalado: no Safari, toque em{" "}
            <Share className="inline size-4 align-text-bottom text-brand" aria-label="Compartilhar" /> →{" "}
            <strong className="text-fg">Adicionar à Tela de Início</strong>, abra o app pela tela de início e volte
            aqui.
          </>
        ) : state.reason === "denied" ? (
          "Os avisos estão bloqueados para este site. Libere nas configurações do navegador (ícone de cadeado ao lado do endereço) e recarregue a página."
        ) : (
          "Este navegador não recebe avisos. Use o Chrome no Android ou o app instalado no iPhone."
        )}
      </p>
    );
  }
  if (state.kind === "off") {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted">
          Receba no celular: lista abrindo, quando você for escolhido no PICK, bolão aberto e fechando, seu ELO depois
          do mix e quem está ao vivo.
        </p>
        <Button variant="primary" className="w-full" disabled={pending} onClick={enable}>
          {pending ? <Loader2 className="animate-spin" /> : <Bell />} Ativar avisos neste aparelho
        </Button>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <ul className="divide-y divide-border">
        {PUSH_TOPICS.map((t) => (
          <li key={t.key} className="flex items-center justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <div className="text-sm font-medium">{t.label}</div>
              <div className="text-xs text-muted">{t.description}</div>
            </div>
            <Switch
              checked={state.topics.includes(t.key)}
              onChange={(on) => toggleTopic(t.key, on)}
              label={t.label}
              disabled={pending}
            />
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" size="sm" disabled={pending} onClick={() => disable(state.endpoint)}>
          <BellOff /> Desativar neste aparelho
        </Button>
        <Button variant="outline" size="sm" disabled={pending} onClick={test}>
          <Send /> Enviar teste
        </Button>
      </div>
    </div>
  );
}
