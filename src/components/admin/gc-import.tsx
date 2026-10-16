"use client";

import { Loader2, Upload, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { analyzeGcPrint } from "@/app/(app)/admin/finalizar/ocr";
import { mapIdFromName, mergeMaps, type MergedResult, type OcrMap } from "@/lib/gc-ocr";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";

const MAX_FILES = 5;
const MAX_SIDE = 1800;
const ACCEPTED = ["image/png", "image/jpeg", "image/webp"];

/** Reduz a imagem no navegador (máx. 1800px, JPEG) e devolve base64 sem prefixo. */
async function compress(file: File): Promise<{ mimeType: string; data: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
  return { mimeType: "image/jpeg", data: dataUrl.slice(dataUrl.indexOf(",") + 1) };
}

const baseName = (file: File) => file.name.replace(/\.[^.]+$/, "");

/**
 * Envio dos prints do placar da GC (um por mapa, na ordem da série): arraste
 * ou clique. Cada print é lido pela IA no servidor; a junção é feita aqui.
 */
export function GcImport({
  maps: knownMaps,
  onImported,
}: {
  maps: { id: string; name: string; shortName?: string | null }[];
  onImported: (result: MergedResult) => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<string | null>(null);
  const [over, setOver] = useState(false);

  function pick(list: FileList | File[]) {
    const images = [...list].filter((f) => ACCEPTED.includes(f.type));
    if (images.length < [...list].length) toast.error("Envie apenas imagens PNG, JPG ou WEBP.");
    if (!images.length) return;
    const next = [...files, ...images].slice(0, MAX_FILES);
    if (files.length + images.length > MAX_FILES) toast.error(`No máximo ${MAX_FILES} prints (um por mapa).`);
    setFiles(next);
  }

  async function run() {
    const maps: OcrMap[] = [];
    for (const [i, file] of files.entries()) {
      setProgress(`Lendo print ${i + 1} de ${files.length}…`);
      let result: Awaited<ReturnType<typeof analyzeGcPrint>>;
      try {
        result = await analyzeGcPrint(await compress(file));
      } catch {
        result = { ok: false, message: "Falha de conexão ao enviar o print." };
      }
      if (!result.ok) {
        setProgress(null);
        toast.error(`Print ${i + 1}: ${result.message}`);
        return;
      }
      // O nome do arquivo é o nome do mapa (o print da GC não mostra o mapa).
      maps.push({ ...result.map, mapName: baseName(file) });
    }
    setProgress(null);
    const merged = mergeMaps(maps);
    onImported(merged);
    toast.success(
      `${maps.length} ${maps.length > 1 ? "prints lidos" : "print lido"}: ${merged.players.length} jogadores. Confira antes de finalizar.`,
    );
  }

  return (
    <div className="space-y-3">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (!progress) pick(e.dataTransfer.files);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-10 text-center transition-colors",
          over ? "border-brand bg-brand/5" : "border-border-strong bg-surface-2/40 hover:border-brand/60",
        )}
      >
        <Upload className={cn("size-10", over ? "text-brand" : "text-muted")} aria-hidden />
        <span className="font-display text-lg font-semibold">Enviar prints do placar</span>
        <span className="text-sm text-muted">Arraste e solte ou clique para enviar várias imagens</span>
        <span className="text-xs font-medium text-brand">
          JPG, PNG ou WEBP · até {MAX_FILES} · nome do arquivo = nome do mapa (ex.: mirage.png)
        </span>
        <input
          type="file"
          accept={ACCEPTED.join(",")}
          multiple
          className="sr-only"
          disabled={!!progress}
          onChange={(e) => {
            pick(e.target.files ?? []);
            e.target.value = "";
          }}
        />
      </label>
      {files.length > 0 && (
        <>
          <ol className="space-y-1 text-sm">
            {files.map((f, i) => {
              const id = mapIdFromName(baseName(f), knownMaps);
              const name = knownMaps.find((m) => m.id === id)?.name;
              return (
                <li
                  key={`${f.name}-${i}`}
                  className="flex items-center justify-between gap-2 rounded-md bg-surface-2 px-3 py-1.5"
                >
                  <span className="truncate">
                    <span className="mr-2 text-xs font-semibold text-muted">Mapa {i + 1}</span>
                    {f.name}
                    {name ? (
                      <span className="ml-2 text-xs font-semibold text-win">→ {name}</span>
                    ) : (
                      <span className="ml-2 text-xs text-loss">mapa não reconhecido pelo nome</span>
                    )}
                  </span>
                  <button
                    type="button"
                    aria-label={`Remover ${f.name}`}
                    disabled={!!progress}
                    onClick={() => setFiles((l) => l.filter((_, j) => j !== i))}
                    className="text-muted hover:text-loss"
                  >
                    <X className="size-4" />
                  </button>
                </li>
              );
            })}
          </ol>
          <Button variant="primary" className="w-full" disabled={!!progress} onClick={run}>
            {progress ? <Loader2 className="animate-spin" /> : <Upload />}
            {progress ?? `Ler ${files.length > 1 ? `${files.length} prints` : "print"} com IA`}
          </Button>
        </>
      )}
    </div>
  );
}
