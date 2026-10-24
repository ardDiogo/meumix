"use client";

import { Download, Loader2, Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogTrigger } from "../ui/dialog";

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden>
      <path d="M17.47 14.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.47-1.75-1.64-2.05-.17-.3-.02-.46.13-.6.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.09 1.75-.72 2-1.41.25-.69.25-1.29.17-1.41-.07-.12-.27-.2-.57-.35M12.05 21.79h-.01a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 0 1-1.51-5.26c0-5.45 4.44-9.88 9.89-9.88 2.64 0 5.12 1.03 6.99 2.9a9.82 9.82 0 0 1 2.89 6.99c0 5.45-4.44 9.88-9.88 9.88m8.41-18.3A11.82 11.82 0 0 0 12.05 0C5.5 0 .16 5.34.16 11.89c0 2.1.55 4.14 1.59 5.95L.06 24l6.3-1.65a11.88 11.88 0 0 0 5.68 1.45h.01c6.55 0 11.89-5.34 11.89-11.89a11.82 11.82 0 0 0-3.48-8.42" />
    </svg>
  );
}

/**
 * Card único do resultado (imagem) para mandar no WhatsApp. No celular abre o
 * menu de compartilhar com a imagem; no computador baixa a imagem e abre o
 * WhatsApp com o texto e o link.
 */
export function ShareResult({
  matchId,
  fileName,
  text,
  chronicle,
}: {
  matchId: string;
  fileName: string;
  text: string;
  /** Crônica do mix no formato do WhatsApp (vai na imagem e na mensagem). */
  chronicle?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [withChronicle, setWithChronicle] = useState(true);
  const [files, setFiles] = useState<Record<string, File>>({});
  const [loading, setLoading] = useState(false);
  const useChronicle = !!chronicle && withChronicle;
  const src = `/api/mixes/${matchId}/card${useChronicle ? "" : "?cronica=0"}`;
  const file = files[src] ?? null;

  // Baixa a imagem ao abrir: o compartilhamento precisa acontecer logo após o clique.
  useEffect(() => {
    if (!open || file) return;
    let cancelled = false;
    const timer = setTimeout(() => setLoading(true));
    fetch(src)
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
      .then(
        (blob) => !cancelled && setFiles((f) => ({ ...f, [src]: new File([blob], fileName, { type: "image/png" }) })),
      )
      .catch(() => !cancelled && toast.error("Não foi possível gerar a imagem do resultado."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, file, src, fileName]);

  const link = typeof window === "undefined" ? "" : window.location.href.split("?")[0]!;
  const message = useChronicle ? `${chronicle}\n\n${link}` : `${text}\n\nVeja as estatísticas completas: ${link}`;

  function download() {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function share() {
    if (!file) return;
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], text: message });
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    }
    // Computador: baixa a imagem e abre o WhatsApp com o texto (anexe a imagem baixada).
    download();
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener");
    toast.success("Imagem baixada. Anexe no WhatsApp junto com a mensagem.");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="primary" size="sm">
          <Share2 /> Compartilhar resultado
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Compartilhar resultado"
        description="Card com placar, estatísticas, destaques e a crônica para mandar no grupo."
        className="max-w-lg"
      >
        {chronicle && (
          <label className="mb-3 flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={withChronicle}
              onChange={(e) => setWithChronicle(e.target.checked)}
              className="size-4 accent-[#FF6A00]"
            />
            Incluir a crônica na imagem e na mensagem
          </label>
        )}
        <div className="max-h-[55vh] overflow-y-auto rounded-md border border-border bg-bg">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img key={src} src={src} alt="Card do resultado do mix" className="w-full" />
        </div>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Button
            className="flex-1 bg-[#25D366] font-semibold text-black hover:bg-[#1ebe5b]"
            disabled={!file}
            onClick={share}
          >
            {loading ? <Loader2 className="animate-spin" /> : <WhatsAppIcon />} Compartilhar no WhatsApp
          </Button>
          <Button variant="secondary" disabled={!file} onClick={download}>
            <Download /> Baixar imagem
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
