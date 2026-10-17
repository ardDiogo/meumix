"use client";

import { Loader2, Search } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { fetchFaceitMatches } from "@/app/(app)/admin/finalizar/faceit";
import type { MergedResult } from "@/lib/gc-ocr";
import { Button } from "../ui/button";
import { Textarea } from "../ui/input";

/** Busca a partida na Faceit pelo link da sala (um link por mapa da série). */
export function FaceitImport({
  onImported,
}: {
  onImported: (result: MergedResult, links: Record<string, string>) => void;
}) {
  const [value, setValue] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2 rounded-lg border border-border bg-surface-2/40 p-4">
      <label htmlFor="faceit-links" className="text-sm font-medium">
        Link da sala na Faceit
      </label>
      <Textarea
        id="faceit-links"
        rows={3}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={
          "https://www.faceit.com/pt/cs2/room/1-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx\n(um link por mapa, se a série teve mais de uma partida)"
        }
        className="font-mono text-xs"
      />
      <p className="text-xs text-subtle">
        Os jogadores são vinculados pelo SteamID/ID Faceit (sem depender do nick). A Faceit não informa RP nem KAST.
      </p>
      <Button
        variant="primary"
        className="w-full"
        disabled={pending || !value.trim()}
        onClick={() =>
          start(async () => {
            const r = await fetchFaceitMatches(value);
            if (!r.ok) return void toast.error(r.message);
            onImported(r.result, r.links);
            toast.success(
              `${r.result.maps.length} mapa(s), ${r.result.players.length} jogadores. Preencha o RP e confira antes de finalizar.`,
            );
          })
        }
      >
        {pending ? <Loader2 className="animate-spin" /> : <Search />} Buscar na Faceit
      </Button>
    </div>
  );
}
