"use client";

import { Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "../ui/button";

/**
 * Compartilha o campeonato: no celular abre o menu de compartilhar com a capa e a
 * mensagem; no computador abre o WhatsApp com a mensagem (o link é o da inscrição em 1 toque).
 */
export function ShareChampionshipButton({
  path,
  message,
  bannerUrl,
  fileName,
  size,
}: {
  /** Caminho da inscrição (ex.: /campeonatos/x/inscrever). */
  path: string;
  /** Mensagem com "{link}" no lugar do endereço. */
  message: string;
  bannerUrl: string | null;
  fileName: string;
  size?: "sm";
}) {
  const [file, setFile] = useState<File | null>(null);
  // A capa é baixada antes: o compartilhamento precisa acontecer logo após o clique.
  useEffect(() => {
    if (!bannerUrl) return;
    let cancelled = false;
    fetch(bannerUrl)
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
      .then((b) => !cancelled && setFile(new File([b], fileName, { type: b.type || "image/jpeg" })))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [bannerUrl, fileName]);

  async function share() {
    const text = message.replace("{link}", `${window.location.origin}${path}`);
    const mobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (mobile && navigator.share) {
      try {
        if (file && navigator.canShare?.({ files: [file], text })) await navigator.share({ files: [file], text });
        else await navigator.share({ text });
        return;
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
    void navigator.clipboard?.writeText(text).then(
      () => toast.success("Mensagem copiada também."),
      () => undefined,
    );
  }

  return (
    <Button variant="outline" size={size} onClick={() => void share()}>
      <Share2 /> Compartilhar
    </Button>
  );
}
