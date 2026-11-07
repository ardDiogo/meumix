import type { Metadata } from "next";
import Link from "next/link";
import { HowItWorks } from "@/components/championships/how-it-works";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { DEFAULT_INPUT } from "@/lib/championship";

export const metadata: Metadata = { title: "Como funciona os campeonatos" };

/** Como funcionam os campeonatos do MeuMix, em geral (todas as possibilidades). */
export default function HowChampionshipsWork() {
  return (
    <>
      <PageHeader
        eyebrow="MeuMix Championship"
        title="Como funciona"
        description="A lógica dos campeonatos do começo ao fim, com todas as possibilidades."
        actions={
          <Button variant="outline" asChild>
            <Link href="/campeonatos">Ver campeonatos</Link>
          </Button>
        }
      />
      <HowItWorks c={DEFAULT_INPUT} general />
    </>
  );
}
