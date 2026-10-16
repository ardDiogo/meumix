import { ArrowLeft, CheckCircle2, LockKeyhole } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { FinalizeForm } from "@/components/admin/finalize-form";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPermissions } from "@/services/auth";
import { getOccurrenceForFinalization } from "@/services/mix-events";

export const metadata: Metadata = { title: "Finalizar mix" };
// A leitura dos prints por IA pode levar alguns segundos por imagem.
export const maxDuration = 60;

export default async function FinalizePage({ searchParams }: PageProps<"/admin/finalizar">) {
  const { canManageMixes } = await getPermissions();
  if (!canManageMixes) {
    return (
      <Card>
        <EmptyState icon={LockKeyhole} title="Acesso restrito a administradores" />
      </Card>
    );
  }

  const { agenda, data } = await searchParams;
  const occurrence =
    typeof agenda === "string" && typeof data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(data)
      ? await getOccurrenceForFinalization(agenda, data)
      : null;

  const back = (
    <Button variant="ghost" size="sm" className="mb-3 -ml-2" asChild>
      <Link href="/admin">
        <ArrowLeft /> Painel administrativo
      </Link>
    </Button>
  );

  if (!occurrence) {
    return (
      <>
        {back}
        <Card>
          <EmptyState
            icon={LockKeyhole}
            title="Mix não encontrado"
            description="Volte ao painel e escolha um mix para finalizar."
          />
        </Card>
      </>
    );
  }

  if (occurrence.finalizedMatchId) {
    return (
      <>
        {back}
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
      </>
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
  const [d, m, y] = [data!.slice(8, 10), data!.slice(5, 7), data!.slice(0, 4)];

  return (
    <>
      {back}
      <PageHeader
        title="Finalizar mix"
        description={`Mix de ${d}/${m}/${y}. Confira os times, informe o placar e as estatísticas de cada jogador.`}
      />
      <FinalizeForm
        scheduleId={agenda as string}
        date={data as string}
        maps={occurrence.votes.maps}
        initialMaps={occurrence.tiebreaker.finalMaps.map((x) => x.id)}
        players={classified.map((r, i) => ({
          userId: r.userId,
          name: r.displayName,
          team: teamOf(r.userId, i),
          elo: eloOf.get(r.userId) ?? 0,
        }))}
      />
    </>
  );
}
