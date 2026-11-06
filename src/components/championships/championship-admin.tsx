"use client";

import { Loader2, Trash2, UserPlus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteChampionship, setOrganizer } from "@/app/(app)/campeonatos/actions";
import { Avatar } from "../ui/avatar";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader } from "../ui/card";
import { Select } from "../ui/input";

type Person = { userId: string; nickname: string; avatarUrl: string | null };

/** Super admin: libera ou remove quem pode organizar este campeonato. */
export function OrganizersPanel({
  championshipId,
  organizers,
  players,
  createdBy,
}: {
  championshipId: string;
  organizers: Person[];
  players: { id: string; nickname: string }[];
  createdBy: string | null;
}) {
  const router = useRouter();
  const [pick, setPick] = useState("");
  const [pending, start] = useTransition();
  const taken = new Set([...organizers.map((o) => o.userId), createdBy]);
  const run = (userId: string, on: boolean) =>
    start(async () => {
      const r = await setOrganizer(championshipId, userId, on);
      if (!r.ok) return void toast.error(r.message);
      toast.success(r.message);
      setPick("");
      router.refresh();
    });
  return (
    <Card>
      <CardHeader
        title="Organizadores"
        description="Além de quem criou, quem você liberar aqui também administra este campeonato."
      />
      <CardContent className="space-y-3">
        {organizers.length > 0 && (
          <ul className="divide-y divide-border rounded-md border border-border">
            {organizers.map((o) => (
              <li key={o.userId} className="flex items-center gap-2.5 px-3 py-2 text-sm">
                <Avatar name={o.nickname} src={o.avatarUrl} size="xs" />
                <span className="flex-1 truncate font-medium">{o.nickname}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  aria-label={`Remover ${o.nickname}`}
                  onClick={() => run(o.userId, false)}
                >
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <Select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Jogador" className="flex-1">
            <option value="">Escolha um jogador…</option>
            {players
              .filter((p) => !taken.has(p.id))
              .sort((a, b) => a.nickname.localeCompare(b.nickname, "pt-BR"))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nickname}
                </option>
              ))}
          </Select>
          <Button variant="outline" disabled={!pick || pending} onClick={() => run(pick, true)}>
            {pending ? <Loader2 className="animate-spin" /> : <UserPlus />} Liberar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** Exclui o campeonato (quem criou ou o super admin), com confirmação. */
export function DeleteChampionship({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Card className="border-loss/30">
      <CardHeader
        title="Excluir campeonato"
        description="Apaga o campeonato, as equipes e tudo o que foi registrado."
      />
      <CardContent>
        <Button
          variant="danger"
          disabled={pending}
          onClick={() =>
            confirm(`Excluir "${name}"? Equipes, draft, jogos e resultados somem. Não dá para desfazer.`) &&
            start(async () => {
              const r = await deleteChampionship(id);
              if (!r.ok) return void toast.error(r.message);
              toast.success(r.message);
              router.push("/campeonatos");
            })
          }
        >
          {pending ? <Loader2 className="animate-spin" /> : <Trash2 />} Excluir campeonato
        </Button>
      </CardContent>
    </Card>
  );
}
