import "server-only";
import webpush from "web-push";
import { LEGAL } from "@/lib/legal";
import type { PushTopic } from "@/lib/push-topics";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Avisos no celular (Web Push). Chaves VAPID na Vercel: `VAPID_PUBLIC_KEY` e
 * `VAPID_PRIVATE_KEY` (geradas em Admin → Configurações → Avisos no celular).
 * Sem as chaves ou sem a migração 0031, nada é enviado e nada quebra.
 */
export function vapidPublicKey() {
  return process.env.VAPID_PUBLIC_KEY?.trim() || null;
}

export const pushConfigured = () => !!vapidPublicKey() && !!process.env.VAPID_PRIVATE_KEY?.trim();

let configured = false;
function setup() {
  if (configured) return true;
  if (!pushConfigured()) return false;
  try {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT?.trim() || `mailto:${LEGAL.contactEmail}`,
      vapidPublicKey()!,
      process.env.VAPID_PRIVATE_KEY!.trim(),
    );
    configured = true;
  } catch (e) {
    console.error("[push] chaves VAPID inválidas:", e instanceof Error ? e.message : e);
  }
  return configured;
}

export interface PushMessage {
  title: string;
  body: string;
  /** Página aberta ao tocar no aviso. */
  url?: string;
  /** Avisos com a mesma tag substituem o anterior no celular. */
  tag?: string;
}

export interface PushTarget {
  /** Só quem quer este tipo de aviso (sem tópico: todos os aparelhos, ex.: teste). */
  topic?: PushTopic;
  /** Só estes usuários (padrão: todos os inscritos no tópico). */
  userIds?: string[];
  /** Ninguém destes usuários (ex.: quem já palpitou). */
  exclude?: string[];
  /** Envia uma vez só por chave (ex.: "abre:<agenda>:<data>"). */
  once?: string;
}

/** Marca a chave como enviada; false se já tinha sido (ou se a tabela não existe). */
async function claim(key: string) {
  const admin = createSupabaseAdminClient();
  if (!admin) return false;
  const { error } = await admin.from("push_log").insert({ key: key.slice(0, 200) });
  return !error;
}

/** Envia um aviso. Nunca lança erro: devolve quantos aparelhos receberam. */
export async function sendPush(target: PushTarget, message: PushMessage): Promise<number> {
  try {
    if (!setup()) return 0;
    if (target.userIds && !target.userIds.length) return 0;
    const admin = createSupabaseAdminClient();
    if (!admin) return 0;

    let query = admin.from("push_subscriptions").select("endpoint, user_id, p256dh, auth");
    if (target.topic) query = query.contains("topics", [target.topic]);
    if (target.userIds) query = query.in("user_id", target.userIds);
    const { data, error } = await query;
    if (error) return 0;
    const exclude = new Set(target.exclude ?? []);
    const subs = (data ?? []).filter((s) => !exclude.has(s.user_id as string));
    if (!subs.length) return 0;
    if (target.once && !(await claim(target.once))) return 0;

    const payload = JSON.stringify({
      title: message.title.slice(0, 120),
      body: message.body.slice(0, 300),
      url: message.url ?? "/dashboard",
      tag: message.tag,
    });
    const gone: string[] = [];
    const sent: string[] = [];
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint as string, keys: { p256dh: s.p256dh as string, auth: s.auth as string } },
            payload,
            { TTL: 6 * 3600, urgency: "high", timeout: 10_000 },
          );
          sent.push(s.endpoint as string);
        } catch (e) {
          const status = (e as { statusCode?: number }).statusCode;
          // Aparelho desinscrito ou inscrição vencida: apaga.
          if (status === 404 || status === 410) gone.push(s.endpoint as string);
          else console.error("[push] envio:", status ?? (e instanceof Error ? e.message : e));
        }
      }),
    );
    if (gone.length) await admin.from("push_subscriptions").delete().in("endpoint", gone);
    if (sent.length)
      await admin.from("push_subscriptions").update({ last_sent_at: new Date().toISOString() }).in("endpoint", sent);
    return sent.length;
  } catch (e) {
    console.error("[push] falha:", e instanceof Error ? e.message : e);
    return 0;
  }
}
