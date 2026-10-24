"use client";

/** Avisos no celular, lado do navegador: suporte, permissão e inscrição. */

export type PushSupport = "unsupported" | "ios-install" | "denied" | "supported";

function isIos() {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function pushSupport(): PushSupport {
  const capable = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  // No iPhone, avisos só funcionam com o app instalado na tela de início (iOS 16.4+).
  if (isIos() && !isStandalone()) return "ios-install";
  if (!capable) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  return "supported";
}

function keyBytes(base64url: string) {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function registration() {
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (existing) return existing;
  await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
  return navigator.serviceWorker.ready;
}

/** Inscrição atual deste aparelho (null se os avisos não estão ligados). */
export async function currentSubscription() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
  const reg = await navigator.serviceWorker.getRegistration("/");
  return (await reg?.pushManager.getSubscription()) ?? null;
}

/** Pede permissão e inscreve o aparelho. Lança erro com mensagem amigável. */
export async function subscribePush(publicKey: string) {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error(
      permission === "denied"
        ? "Os avisos foram bloqueados. Libere nas configurações do navegador para este site."
        : "Permissão não concedida.",
    );
  }
  const reg = await registration();
  const old = await reg.pushManager.getSubscription();
  if (old) return old;
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
}
