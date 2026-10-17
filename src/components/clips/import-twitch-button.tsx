"use client";

import { Loader2 } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { importTwitchClips, type ImportResult } from "@/app/(app)/clipes/actions";
import { TwitchIcon } from "../twitch/twitch-icon";
import { Button } from "../ui/button";

/** Admin: busca os clipes criados nos canais dos jogadores durante o mix. */
export function ImportTwitchButton({ matchId }: { matchId: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          let r: ImportResult;
          try {
            r = await importTwitchClips(matchId);
          } catch {
            r = { ok: false, message: "Erro inesperado ao importar. Tente de novo." };
          }
          const description = r.details?.join("\n") || undefined;
          if (r.ok) toast.success(r.message, { description });
          else toast.error(r.message, { description });
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : <TwitchIcon className="text-[#9146FF]" />} Importar da Twitch
    </Button>
  );
}
