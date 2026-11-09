"use client";

import { Loader2, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { renameLeague } from "@/app/(app)/liga/actions";
import type { League } from "@/lib/league";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

const WEEKDAY = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

/** Super admin: nome de cada liga (aparece no seletor do topo, ranking e perfis). */
export function LeagueNamesForm({ leagues }: { leagues: League[] }) {
  return (
    <ul className="space-y-2">
      {leagues.map((l) => (
        <LeagueNameRow key={l.id} league={l} />
      ))}
    </ul>
  );
}

function LeagueNameRow({ league }: { league: League }) {
  const router = useRouter();
  const [name, setName] = useState(league.name);
  const [pending, start] = useTransition();
  const clean = name.replace(/\s+/g, " ").trim();
  const changed = clean !== league.name;
  const valid = clean.length >= 3 && clean.length <= 40;
  const day = league.weekday != null ? WEEKDAY[league.weekday]! : "Liga";
  return (
    <li>
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await renameLeague(league.id, clean);
            if (r.ok) toast.success(r.message);
            else toast.error(r.message);
            router.refresh();
          });
        }}
      >
        <span className="w-16 shrink-0 text-xs text-muted">{day}</span>
        <Input
          aria-label={`Nome da liga de ${day}`}
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
          className="h-9"
        />
        <Button type="submit" size="sm" variant="primary" disabled={pending || !changed || !valid}>
          {pending ? <Loader2 className="animate-spin" /> : <Save />} Salvar
        </Button>
      </form>
    </li>
  );
}
