import { notFound } from "next/navigation";
import { HowItWorks } from "@/components/championships/how-it-works";
import { getChampionship } from "@/services/championships";

export const metadata = { title: "Como funciona o campeonato" };

/** Como funciona, com a configuração deste campeonato. */
export default async function HowItWorksPage({ params }: PageProps<"/campeonatos/[slug]/como-funciona">) {
  const data = await getChampionship((await params).slug);
  if (!data) notFound();
  return <HowItWorks c={data.championship} />;
}
