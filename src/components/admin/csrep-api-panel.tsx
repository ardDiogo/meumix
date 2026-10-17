"use client";

import { Copy, Download, Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { fetchCsrepSpec, probeCsrep, type CsrepProbeResult } from "@/app/(app)/admin/csrep-actions";
import { Button } from "../ui/button";
import { Input, Label } from "../ui/input";

export function CsrepApiPanel({ configured }: { configured: boolean }) {
  const [path, setPath] = useState("/matches/gamersclub/");
  const [result, setResult] = useState<CsrepProbeResult | null>(null);
  const [isSpec, setIsSpec] = useState(false);
  const [pending, start] = useTransition();

  const run = (spec: boolean) =>
    start(async () => {
      const r = spec ? await fetchCsrepSpec() : await probeCsrep(path);
      setResult(r);
      setIsSpec(spec && r.ok);
      if (!r.ok && !r.body) toast.error(r.message);
    });

  const download = () => {
    if (!result?.body) return;
    const url = URL.createObjectURL(new Blob([result.body], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = isSpec ? "csrep-openapi.json" : "csrep-resposta.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const copy = async () => {
    if (!result?.body) return;
    try {
      await navigator.clipboard.writeText(result.body);
      toast.success("Copiado.");
    } catch {
      toast.error("Não foi possível copiar.");
    }
  };

  if (!configured) {
    return (
      <p className="px-4 pb-4 text-sm text-muted">
        Defina <code className="text-fg">CSREP_API_KEY</code> nas variáveis de ambiente da Vercel e faça um redeploy.
      </p>
    );
  }

  return (
    <div className="space-y-4 px-4 pb-4">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={pending} onClick={() => run(true)}>
          {pending && <Loader2 className="animate-spin" />} Buscar especificação da API
        </Button>
      </div>
      <div>
        <Label htmlFor="csrep-path">Testar endpoint (GET)</Label>
        <div className="flex gap-2">
          <Input
            id="csrep-path"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="/matches/gamersclub/123456"
            autoComplete="off"
          />
          <Button disabled={pending || path.trim().length < 2} onClick={() => run(false)}>
            {pending && <Loader2 className="animate-spin" />} Testar
          </Button>
        </div>
        <p className="mt-1.5 text-xs text-subtle">
          A chamada sai do servidor com a sua chave; a chave nunca aparece aqui. Ex.: /matches/gamersclub/ID_DA_PARTIDA.
        </p>
      </div>
      {result && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className={result.ok ? "text-sm text-win" : "text-sm text-loss"}>{result.message}</span>
            {result.body && (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={copy}>
                  <Copy /> Copiar
                </Button>
                <Button size="sm" variant="outline" onClick={download}>
                  <Download /> Baixar .json
                </Button>
              </div>
            )}
          </div>
          {result.body && (
            <pre className="max-h-96 overflow-auto rounded-lg border border-border bg-bg p-3 text-xs break-all whitespace-pre-wrap text-muted">
              {result.body.slice(0, 20_000)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
