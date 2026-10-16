import { Clapperboard, Flame, Plus, ShieldCheck, Sparkles, Zap } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DemoBadge } from "@/components/demo-notice";
import { NotImplementedButton } from "@/components/not-implemented";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/format";
import type { HighlightKind } from "@/types/domain";
import { getHighlightsFeed } from "@/services/queries";

export const metadata: Metadata = { title: "Clipes e highlights" };

const KIND: Record<HighlightKind, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  ace: { label: "Ace", icon: Flame },
  clutch: { label: "Clutch", icon: ShieldCheck },
  multikill: { label: "Multikill", icon: Zap },
  clip: { label: "Clipe", icon: Clapperboard },
  other: { label: "Destaque", icon: Sparkles },
};

export default async function ClipsPage() {
  const { kind, highlights, mixes, players } = await getHighlightsFeed();

  return (
    <>
      <PageHeader
        title="Clipes e highlights"
        description="Jogadas de destaque dos mixes: aces, clutches e clipes enviados pela comunidade."
        actions={
          <>
            <DemoBadge kind={kind} />
            <NotImplementedButton feature="Envio de clipes" variant="primary">
              <Plus /> Enviar clipe
            </NotImplementedButton>
          </>
        }
      />
      {highlights.length ? (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {highlights.map((h) => {
            const k = KIND[h.kind];
            const Icon = k.icon;
            const mix = mixes.get(h.mixId);
            const player = h.playerId ? players.get(h.playerId) : undefined;
            return (
              <li key={h.id}>
                <Card className="flex h-full flex-col overflow-hidden">
                  <div className="flex aspect-video items-center justify-center border-b border-border bg-surface-2">
                    <div className="flex flex-col items-center gap-2 text-subtle">
                      <Icon className="size-7" />
                      <span className="text-xs">{h.url ? "Clipe disponível" : "Sem mídia vinculada"}</span>
                    </div>
                  </div>
                  <div className="flex flex-1 flex-col gap-1 p-4">
                    <div className="flex items-center gap-2">
                      <Badge variant={h.kind === "ace" ? "brand" : "neutral"}>{k.label}</Badge>
                      <span className="text-xs text-subtle">{formatDate(h.createdAt)}</span>
                    </div>
                    <div className="mt-1 font-medium">
                      {player && (
                        <Link href={`/jogadores/${player.id}`} className="text-brand hover:underline">
                          {player.nickname}
                        </Link>
                      )}{" "}
                      — {h.title}
                    </div>
                    {mix && (
                      <Link href={`/mixes/${mix.id}`} className="text-sm text-muted hover:text-fg">
                        {mix.name}
                      </Link>
                    )}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      ) : (
        <Card>
          <EmptyState
            icon={Clapperboard}
            title="Nenhum highlight ainda"
            description="Aces, clutches e clipes dos mixes aparecerão aqui."
          />
        </Card>
      )}
    </>
  );
}
