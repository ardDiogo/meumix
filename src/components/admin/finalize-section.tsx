import { CheckCircle2, LockKeyhole } from "lucide-react";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getOccurrenceForFinalization } from "@/services/mix-events";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { EmptyState } from "../ui/empty-state";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
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
  // Todos os perfis: nicks do print que não se inscreveram no site ainda são ligados à conta certa.
  const { data: profiles } = await supabase!.from("profiles").select("id, display_name, elo");
  const eloOf = new Map((profiles ?? []).map((p) => [p.id as string, p.elo as number]));
  // Apelidos já vinculados em finalizações anteriores (sem a migração 0030: nenhum).
  const { data: aliasRows } = (await createSupabaseAdminClient()
    ?.from("player_aliases")
    .select("alias_norm, user_id")) ?? {
    data: null,
  };
  const aliases = Object.fromEntries((aliasRows ?? []).map((a) => [a.alias_norm as string, a.user_id as string]));
  // SteamID de quem vinculou a Steam: a importação da GC reconhece o jogador já na primeira vez.
  const { data: steamRows } = (await createSupabaseAdminClient()
    ?.from("profiles")
    .select("id, steam_id")
    .not("steam_id", "is", null)) ?? { data: null };
  const steamIds = Object.fromEntries((steamRows ?? []).map((p) => [p.steam_id as string, p.id as string]));

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
      aliases={aliases}
      steamIds={steamIds}
      otherProfiles={(profiles ?? [])
        .filter((p) => !classified.some((r) => r.userId === p.id))
        .map((p) => ({ userId: p.id as string, name: p.display_name as string, elo: (p.elo as number) ?? 0 }))}
      players={classified.map((r, i) => ({
        userId: r.userId,
        name: r.displayName,
        team: teamOf(r.userId, i),
        elo: eloOf.get(r.userId) ?? 0,
      }))}
    />
  );
}
