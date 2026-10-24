"use server";

import { headers } from "next/headers";
import { ALL_TOPICS, isPushTopic, type PushTopic } from "@/lib/push-topics";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { audit } from "@/services/audit";
import { getSession } from "@/services/auth";
import { pushConfigured, sendPush } from "@/services/push";

export type PushResult = { ok: true; message: string } | { ok: false; message: string };

const validEndpoint = (v: unknown): v is string =>
  typeof v === "string" && v.length >= 10 && v.length <= 1000 && /^https:\/\//i.test(v);
const validKey = (v: unknown, max: number): v is string =>
  typeof v === "string" && v.length > 0 && v.length <= max && /^[A-Za-z0-9_=-]+$/.test(v);
const cleanTopics = (topics: unknown): PushTopic[] =>
  Array.isArray(topics) ? [...new Set(topics.filter(isPushTopic))] : ALL_TOPICS;

const MISSING = "Rode a migração 0031_bolao_push.sql no Supabase.";

/** Liga os avisos neste aparelho (ou atualiza a inscrição dele). */
export async function savePushSubscription(
  sub: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } },
  topics?: string[],
): Promise<PushResult> {
  const session = await getSession();
  if (!session) return { ok: false, message: "Entre na sua conta para ativar os avisos." };
  if (!pushConfigured()) return { ok: false, message: "Os avisos ainda não foram configurados pelo administrador." };
  if (!validEndpoint(sub.endpoint) || !validKey(sub.keys?.p256dh, 200) || !validKey(sub.keys?.auth, 100)) {
    return { ok: false, message: "Inscrição do navegador inválida." };
  }
  const admin = createSupabaseAdminClient();
  if (!admin) return { ok: false, message: "Servidor não configurado." };
  const ua = (await headers()).get("user-agent")?.slice(0, 200) ?? null;
  const { error } = await admin.from("push_subscriptions").upsert(
    {
      endpoint: sub.endpoint,
      user_id: session.id,
      p256dh: sub.keys!.p256dh,
      auth: sub.keys!.auth,
      topics: topics ? cleanTopics(topics) : ALL_TOPICS,
      user_agent: ua,
    },
    { onConflict: "endpoint" },
  );
  if (error) return { ok: false, message: error.code === "42P01" ? MISSING : "Não foi possível ativar os avisos." };
  await audit({ action: "push.subscribe", outcome: "success", actorId: session.id });
  return { ok: true, message: "Avisos ativados neste aparelho." };
}

/** Tipos de aviso escolhidos neste aparelho (null: aparelho não inscrito). */
export async function getPushTopics(endpoint: string): Promise<PushTopic[] | null> {
  const session = await getSession();
  const admin = createSupabaseAdminClient();
  if (!session || !admin || !validEndpoint(endpoint)) return null;
  const { data } = await admin
    .from("push_subscriptions")
    .select("topics")
    .eq("endpoint", endpoint)
    .eq("user_id", session.id)
    .maybeSingle();
  return data ? cleanTopics(data.topics) : null;
}

export async function updatePushTopics(endpoint: string, topics: string[]): Promise<PushResult> {
  const session = await getSession();
  const admin = createSupabaseAdminClient();
  if (!session || !admin || !validEndpoint(endpoint)) return { ok: false, message: "Não foi possível salvar." };
  const { error } = await admin
    .from("push_subscriptions")
    .update({ topics: cleanTopics(topics) })
    .eq("endpoint", endpoint)
    .eq("user_id", session.id);
  return error ? { ok: false, message: "Não foi possível salvar." } : { ok: true, message: "Preferências salvas." };
}

export async function deletePushSubscription(endpoint: string): Promise<PushResult> {
  const session = await getSession();
  const admin = createSupabaseAdminClient();
  if (!session || !admin || !validEndpoint(endpoint)) return { ok: false, message: "Não foi possível desativar." };
  await admin.from("push_subscriptions").delete().eq("endpoint", endpoint).eq("user_id", session.id);
  return { ok: true, message: "Avisos desativados neste aparelho." };
}

/** Aviso de teste para os aparelhos de quem pediu. */
export async function sendTestPush(): Promise<PushResult> {
  const session = await getSession();
  if (!session) return { ok: false, message: "Entre na sua conta." };
  const sent = await sendPush(
    { userIds: [session.id] },
    {
      title: "MeuMix",
      body: `Tudo certo, ${session.displayName}! Os avisos estão chegando.`,
      url: "/configuracoes",
      tag: "teste",
    },
  );
  return sent
    ? { ok: true, message: `Aviso de teste enviado para ${sent} aparelho${sent > 1 ? "s" : ""}.` }
    : { ok: false, message: "Nenhum aparelho recebeu. Desative e ative os avisos de novo." };
}
