"use client";

import { Link2, Loader2 } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { linkGuests } from "@/app/(app)/mixes/[id]/actions";
import { matchProfiles } from "@/lib/gc-ocr";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader } from "../ui/card";
import { Select } from "../ui/input";

/**
 * Admin: liga os convidados (nicks do print sem conta) aos jogadores
 * cadastrados. Já sugere o perfil pelo nick parecido.
 */
export function LinkGuests({
  matchId,
  guests,
  profiles,
}: {
  matchId: string;
  guests: { recordId: string; name: string; rp: number }[];
  profiles: { id: string; name: string }[];
}) {
  const suggested = useMemo(() => {
    const idx = matchProfiles(
      guests.map((g) => ({ aliases: [g.name] })),
      profiles,
    );
    return Object.fromEntries(guests.map((g, i) => [g.recordId, idx[i]! >= 0 ? profiles[idx[i]!]!.id : ""]));
  }, [guests, profiles]);
  const [choice, setChoice] = useState<Record<string, string>>(suggested);
  const [applyElo, setApplyElo] = useState(true);
  const [pending, start] = useTransition();
  const links = guests
    .filter((g) => choice[g.recordId])
    .map((g) => ({ recordId: g.recordId, userId: choice[g.recordId]! }));

  return (
    <Card className="border-brand/40">
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Link2 className="size-4 text-brand" aria-hidden /> Vincular convidados às contas
          </span>
        }
        description="Estes nicks foram salvos sem conta, então não somaram ELO nem estatísticas. Escolha o jogador de cada um (já sugerimos pelo nick). Visível só para administradores."
      />
      <CardContent className="space-y-3">
        <ul className="space-y-2">
          {guests.map((g) => (
            <li key={g.recordId} className="flex flex-wrap items-center gap-2">
              <span className="w-56 truncate text-sm font-medium" title={g.name}>
                {g.name}
                <span className={g.rp >= 0 ? "ml-2 text-xs text-win" : "ml-2 text-xs text-loss"}>
                  {g.rp > 0 ? `+${g.rp}` : g.rp} RP
                </span>
              </span>
              <span className="text-subtle">→</span>
              <Select
                aria-label={`Conta de ${g.name}`}
                value={choice[g.recordId] ?? ""}
                onChange={(e) => setChoice((c) => ({ ...c, [g.recordId]: e.target.value }))}
                className="w-56"
              >
                <option value="">Deixar como convidado</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </li>
          ))}
        </ul>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={applyElo}
            onChange={(e) => setApplyElo(e.target.checked)}
            className="size-4 accent-brand"
          />
          Aplicar o RP desta partida ao ELO atual de cada jogador
        </label>
        <Button
          variant="primary"
          disabled={pending || !links.length}
          onClick={() =>
            start(async () => {
              const r = await linkGuests(matchId, links, applyElo);
              if (r.ok) toast.success(r.message);
              else toast.error(r.message);
            })
          }
        >
          {pending ? <Loader2 className="animate-spin" /> : <Link2 />} Vincular {links.length} jogador(es)
        </Button>
      </CardContent>
    </Card>
  );
}
