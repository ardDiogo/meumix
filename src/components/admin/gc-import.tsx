"use client";

import { ImageUp, Loader2, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { analyzeGcPrint } from "@/app/(app)/admin/finalizar/ocr";
import { mapIdFromName, mergeMaps, type MergedResult, type OcrMap } from "@/lib/gc-ocr";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader } from "../ui/card";

const MAX_FILES = 5;
const MAX_SIDE = 1800;

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

/**
 * Envio dos prints do placar da GC (um por mapa, na ordem da série).
 * Cada print é lido pela IA no servidor; a junção dos mapas é feita aqui.
 */
const baseName = (file: File) => file.name.replace(/\.[^.]+$/, "");

export function GcImport({
  maps: knownMaps,
  onImported,
}: {
  maps: { id: string; name: string }[];
  onImported: (result: MergedResult) => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<string | null>(null);

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
    <Card>
      <CardHeader
        title="Importar prints da Gamers Club"
        description="Envie o print do placar de cada mapa, na ordem da série, com o nome do mapa no nome do arquivo (ex.: mirage.png). A IA preenche placar e estatísticas — confira antes de finalizar."
        action={<Sparkles className="size-4 text-brand" aria-hidden />}
      />
      <CardContent className="space-y-3">
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-md border border-dashed border-border-strong bg-surface-2/50 px-4 py-6 text-center text-sm text-muted transition-colors hover:border-brand hover:text-fg">
          <ImageUp className="size-6" aria-hidden />
          <span>
            <span className="font-medium text-fg">Escolher prints</span> (PNG ou JPG, até {MAX_FILES})
          </span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            className="sr-only"
            onChange={(e) => {
              const picked = [...(e.target.files ?? [])].slice(0, MAX_FILES);
              setFiles(picked);
              e.target.value = "";
            }}
          />
        </label>
        {files.length > 0 && (
          <ol className="space-y-1 text-sm">
            {files.map((f, i) => (
              <li
                key={`${f.name}-${i}`}
                className="flex items-center justify-between gap-2 rounded-md bg-surface-2 px-3 py-1.5"
              >
                <span className="truncate">
                  <span className="mr-2 text-xs font-semibold text-muted">Mapa {i + 1}</span>
                  {f.name}
                  {(() => {
                    const id = mapIdFromName(baseName(f), knownMaps);
                    const name = knownMaps.find((m) => m.id === id)?.name;
                    return name ? (
                      <span className="ml-2 text-xs font-semibold text-win">→ {name}</span>
                    ) : (
                      <span className="ml-2 text-xs text-loss">mapa não reconhecido pelo nome</span>
                    );
                  })()}
                </span>
                <button
                  type="button"
                  aria-label={`Remover ${f.name}`}
                  onClick={() => setFiles((l) => l.filter((_, j) => j !== i))}
                  className="text-muted hover:text-loss"
                >
                  <X className="size-4" />
                </button>
              </li>
            ))}
          </ol>
        )}
        <Button variant="secondary" className="w-full" disabled={!files.length || !!progress} onClick={run}>
          {progress ? <Loader2 className="animate-spin" /> : <Sparkles />}
          {progress ?? "Ler prints com IA"}
        </Button>
      </CardContent>
    </Card>
  );
}
