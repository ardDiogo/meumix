import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ChampionshipForm } from "@/components/championships/championship-form";
import { PageHeader } from "@/components/page-header";
import { DEFAULT_INPUT } from "@/lib/championship";
import { canCreate } from "@/services/championships";

export const metadata: Metadata = { title: "Novo campeonato" };

export default async function NewChampionshipPage() {
  if (!(await canCreate())) redirect("/campeonatos");
  return (
    <>
      <PageHeader
        eyebrow="MeuMix Championship"
        title="Novo campeonato"
        description="Tudo pode ser ajustado depois, na administração do campeonato."
      />
      <ChampionshipForm initial={DEFAULT_INPUT} />
    </>
  );
}
