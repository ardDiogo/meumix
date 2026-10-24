"use client";

import { Check, Copy, KeyRound } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "../ui/button";

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

/** Gera as chaves VAPID no próprio navegador (nada passa pelo servidor). */
export function VapidKeyGenerator() {
  const [keys, setKeys] = useState<{ publicKey: string; privateKey: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const generate = async () => {
    try {
      const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
      const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
      const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
      setKeys({ publicKey: b64url(raw), privateKey: jwk.d! });
    } catch {
      toast.error("Este navegador não conseguiu gerar as chaves.");
    }
  };

  const copy = async (name: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(name);
      toast.success(`${name} copiada.`);
    } catch {
      toast.error("Não foi possível copiar. Selecione e copie à mão.");
    }
  };

  if (!keys) {
    return (
      <Button variant="outline" size="sm" onClick={generate}>
        <KeyRound /> Gerar chaves
      </Button>
    );
  }
  return (
    <div className="space-y-2">
      {(
        [
          ["VAPID_PUBLIC_KEY", keys.publicKey],
          ["VAPID_PRIVATE_KEY", keys.privateKey],
        ] as const
      ).map(([name, value]) => (
        <div key={name} className="rounded-md border border-border bg-surface-2 p-2">
          <div className="mb-1 flex items-center justify-between gap-2">
            <code className="text-xs font-semibold text-fg">{name}</code>
            <Button variant="ghost" size="sm" onClick={() => copy(name, value)}>
              {copied === name ? <Check /> : <Copy />} Copiar
            </Button>
          </div>
          <code className="block text-[11px] break-all text-muted select-all">{value}</code>
        </div>
      ))}
      <p className="text-xs text-subtle">
        Cole as duas na Vercel (marque a privada como <strong>Sensitive</strong>) e faça um novo deploy. Não envie a
        privada para ninguém. Se fechar esta tela antes, é só gerar de novo.
      </p>
    </div>
  );
}
