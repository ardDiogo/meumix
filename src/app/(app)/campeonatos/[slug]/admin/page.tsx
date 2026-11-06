import { notFound, redirect } from "next/navigation";
import { DeleteChampionship, OrganizersPanel } from "@/components/championships/championship-admin";
import { ChampionshipForm } from "@/components/championships/championship-form";
import type { ChampionshipInput } from "@/lib/championship";
import { getChampionship } from "@/services/championships";

export const metadata = { title: "Administração do campeonato" };

export default async function ChampionshipAdminPage({ params }: PageProps<"/campeonatos/[slug]/admin">) {
  const { slug } = await params;
  const data = await getChampionship(slug);
  if (!data) notFound();
  if (!data.canManage) redirect(`/campeonatos/${slug}`);
  const { championship: c, organizers, players, canGrant, canDelete } = data;
  const { id, slug: _s, hasBanner, createdBy, createdAt, updatedAt, ...fields } = c;
  void _s;
  void createdAt;
  const initial: ChampionshipInput = fields;
  return (
    <div className="space-y-4">
      <ChampionshipForm
        id={id}
        initial={initial}
        bannerUrl={hasBanner ? `/api/campeonatos/${id}/banner?v=${encodeURIComponent(updatedAt)}` : null}
      />
      {canGrant && (
        <OrganizersPanel
          championshipId={id}
          organizers={organizers}
          players={players.map((p) => ({ id: p.id, nickname: p.nickname }))}
          createdBy={createdBy}
        />
      )}
      {canDelete && <DeleteChampionship id={id} name={c.name} />}
    </div>
  );
}
