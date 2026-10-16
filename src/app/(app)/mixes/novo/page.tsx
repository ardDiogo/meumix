import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DemoBadge } from "@/components/demo-notice";
import { NewMixForm } from "@/components/mixes/new-mix-form";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { ACTIVE_MAP_POOL } from "@/lib/maps";
import { searchPlayers } from "@/services/queries";
import { getDataSource } from "@/services";

export const metadata: Metadata = { title: "Novo mix" };

export default async function NewMixPage() {
  const players = await searchPlayers("");
  const kind = getDataSource().kind;

  return (
    <>
      <Button variant="ghost" size="sm" className="mb-3 -ml-2" asChild>
        <Link href="/mixes">
          <ArrowLeft /> Mixes
        </Link>
      </Button>
      <PageHeader
        title="Novo mix"
        description="Defina data, mapas e jogadores. A divisão dos times é sugerida automaticamente pelo ELO."
        actions={<DemoBadge kind={kind} />}
      />
      <NewMixForm
        players={players.map(({ player, elo }) => ({ id: player.id, nickname: player.nickname, elo }))}
        maps={ACTIVE_MAP_POOL.map((m) => ({ id: m.id, name: m.name }))}
      />
    </>
  );
}
