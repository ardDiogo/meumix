"use client";

import { Download, Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { importAllstarClips, type ImportResult } from "@/app/(app)/clipes/actions";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogTrigger } from "../ui/dialog";
import { Label, Textarea } from "../ui/input";

/** Admin: importa os clipes do mix colando os links "Full match" do Allstar. */
export function ImportAllstarDialog({ matchId }: { matchId: string }) {
  const [links, setLinks] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [pending, start] = useTransition();

  const submit = () =>
    start(async () => {
      let r: ImportResult;
      try {
        r = await importAllstarClips(matchId, links.split(/\s+/));
      } catch {
        r = { ok: false, message: "Erro inesperado ao importar. Tente de novo." };
      }
      setResult(r);
      if (r.ok) toast.success(r.message);
      else toast.error(r.message);
    });

  return (
    <Dialog onOpenChange={(open) => !open && setResult(null)}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Download /> Importar do Allstar
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Importar clipes do Allstar"
        description="No Allstar, em My Matches, abra o “Full match →” de cada mapa deste mix e cole os links aqui (um por linha). O MeuMix busca os clipes prontos dos jogadores com Steam vinculada."
      >
        <Label htmlFor="allstar-links">Links das partidas (um por mapa)</Label>
        <Textarea
          id="allstar-links"
          rows={4}
          value={links}
          onChange={(e) => setLinks(e.target.value)}
          placeholder={"https://allstar.gg/match/Z2lkOi8v…\nhttps://allstar.gg/match/Z2lkOi8v…"}
          className="font-mono text-xs"
        />
        {result && (
          <div className={result.ok ? "mt-3 text-sm text-win" : "mt-3 text-sm text-loss"}>
            {result.message}
            {!!result.details?.length && (
              <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-muted">
                {result.details.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div className="mt-5 flex justify-end">
          <Button variant="primary" disabled={pending || !links.trim()} onClick={submit}>
            {pending && <Loader2 className="animate-spin" />} {pending ? "Buscando clipes…" : "Importar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
