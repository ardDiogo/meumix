import { CheckCircle2, LockKeyhole } from "lucide-react";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getOccurrenceForFinalization } from "@/services/mix-events";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { EmptyState } from "../ui/empty-state";
import { FinalizeForm } from "./finalize-form";

/** Formulário de finalização de uma ocorrência (usado no painel e em /admin/finalizar). */
export async function FinalizeSection({ scheduleId, date }: { scheduleId: string; date: string }) {
  const occurrence = /^\d{4}-\d{2}-\d{2}$/.test(date) ? await getOccurrenceForFinalization(scheduleId, date) : null;
  if (!occurrence) {
    return (
      <Card>
        <EmptyState
          icon={LockKeyhole}
          title="Mix não encontrado"
          description="Volte ao painel e escolha um mix para finalizar."
        />
      </Card>
    );
  }
  if (occurrence.finalizedMatchId) {
    return (
      <Card>
        <EmptyState
          icon={CheckCircle2}
          title="Este mix já foi finalizado"
          action={
            <Button variant="primary" asChild>
              <Link href={`/mixes/${occurrence.finalizedMatchId}`}>Ver resultado</Link>
            </Button>
          }
        />
      </Card>
    );
  }

  const supabase = await createSupabaseServerClient();
  const ids = occurrence.registrations.map((r) => r.userId);
  const { data: elos } = ids.length ? await supabase!.from("profiles").select("id, elo").in("id", ids) : { data: [] };
  const eloOf = new Map((elos ?? []).map((p) => [p.id as string, p.elo as number]));

  // Times da escolha (se houver); senão, os classificados alternados entre A e B.
  const draft = occurrence.draft;
  const classified = occurrence.registrations.filter((r) => r.status === "classified");
  const teamOf = (id: string, i: number): "A" | "B" =>
    draft?.teamA.includes(id) ? "A" : draft?.teamB.includes(id) ? "B" : i % 2 === 0 ? "A" : "B";

  return (
    <FinalizeForm
      scheduleId={scheduleId}
      date={date}
      maps={occurrence.votes.maps}
      initialMaps={occurrence.tiebreaker.finalMaps.map((x) => x.id)}
      players={classified.map((r, i) => ({
        userId: r.userId,
        name: r.displayName,
        team: teamOf(r.userId, i),
        elo: eloOf.get(r.userId) ?? 0,
      }))}
    />
  );
}
