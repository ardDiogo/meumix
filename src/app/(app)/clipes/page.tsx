import { Clapperboard } from "lucide-react";
import type { Metadata } from "next";
import { AddClipDialog } from "@/components/clips/add-clip-dialog";
import { ClipCard } from "@/components/clips/clip-card";
import { DemoBadge } from "@/components/demo-notice";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/format";
import { getPermissions } from "@/services/auth";
import { toClipViews } from "@/services/clips";
import { getHighlightsFeed } from "@/services/queries";

export const metadata: Metadata = { title: "Clipes e highlights" };

export default async function ClipsPage() {
  const [{ kind, highlights, mixes, players }, { session, canManageMixes }] = await Promise.all([
    getHighlightsFeed(),
    getPermissions(),
  ]);
  const clips = toClipViews(highlights, { players, mixes, viewerId: session?.id ?? null, canManage: canManageMixes });
  const canSend = kind === "supabase" && !!session;

  return (
    <>
      <PageHeader
        title="Clipes e highlights"
        description="Aces, clutches e melhores jogadas dos mixes, direto do Allstar."
        actions={
          <>
            <DemoBadge kind={kind} />
            {canSend && (
              <AddClipDialog
                currentUserId={session.id}
                mixes={[...mixes.values()].map((m) => ({
                  id: m.id,
                  label: `${m.name} · ${formatDate(m.scheduledAt)}`,
                }))}
                players={
                  canManageMixes
                    ? [...players.values()]
                        .map((p) => ({ id: p.id, label: p.nickname }))
                        .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"))
                    : null
                }
              />
            )}
          </>
        }
      />
      {clips.length ? (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {clips.map((c) => (
            <li key={c.id}>
              <ClipCard clip={c} />
            </li>
          ))}
        </ul>
      ) : (
        <Card>
          <EmptyState
            icon={Clapperboard}
            title="Nenhum clipe ainda"
            description="Jogou um mix na GC? O Allstar grava as melhores jogadas sozinho. Copie o link do clipe e envie aqui."
          />
        </Card>
      )}
    </>
  );
}
