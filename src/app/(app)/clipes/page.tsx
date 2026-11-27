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
import { CLIP_KINDS } from "@/components/clips/clip-card";
import { ClipFilters } from "@/components/clips/clip-filters";
import { FillClipsButton } from "@/components/clips/fill-clips-button";
import { mapName } from "@/lib/maps";
import Link from "next/link";
import type { ClipView } from "@/components/clips/clip-card";

const PAGE = 12;

export const metadata: Metadata = { title: "Clipes e highlights" };

export default async function ClipsPage({ searchParams }: PageProps<"/clipes">) {
  const sp = await searchParams;
  const one = (v: unknown) => (typeof v === "string" && v ? v : null);
  const tipo = one(sp.tipo);
  const jogador = one(sp.jogador);
  const mapa = one(sp.mapa);
  const meus = sp.meus === "1";
  const shown = Math.min(240, Math.max(1, Number(one(sp.mais)) || 1) * PAGE);
  const [{ kind, highlights, mixes, players }, { session, canManageMixes }] = await Promise.all([
    getHighlightsFeed(),
    getPermissions(),
  ]);
  const all = toClipViews(highlights, { players, mixes, viewerId: session?.id ?? null, canManage: canManageMixes });
  const canSend = kind === "supabase" && !!session;
  // Quantos clipes ainda estão sem miniatura (o admin completa de uma vez).
  const incomplete = highlights.filter((h) => !h.thumbnailUrl || h.kind === "clip").length;

  // Opções dos filtros: só o que existe nos clipes.
  const kindOptions = Object.entries(CLIP_KINDS)
    .filter(([k]) => all.some((c) => c.kind === k))
    .map(([value, k]) => ({ value, label: k.label }));
  const playerOptions = [
    ...new Map(all.filter((c) => c.playerId && c.player).map((c) => [c.playerId!, c.player!.name])),
  ]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  const mapOptions = [...new Set(all.map((c) => c.meta.mapId).filter((m): m is NonNullable<typeof m> => !!m))]
    .map((value) => ({ value, label: mapName(value) }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));

  const filtered = all.filter(
    (c) =>
      (!tipo || c.kind === tipo) &&
      (!jogador || c.playerId === jogador) &&
      (!mapa || c.meta.mapId === mapa) &&
      (!meus || (!!session && c.playerId === session.id)),
  );
  // Mais recentes primeiro (pela data do mix; sem mix, pela do envio).
  const when = (c: ClipView) => c.mix?.date ?? c.createdAt;
  const sorted = [...filtered].sort((a, b) => when(b).localeCompare(when(a)) || b.createdAt.localeCompare(a.createdAt));
  // Destaque: o ace ou clutch mais recente (só sem filtros).
  const anyFilter = !!(tipo || jogador || mapa || meus);
  const featured = anyFilter ? null : (sorted.find((c) => c.kind === "ace" || c.kind === "clutch") ?? null);
  const rest = sorted.filter((c) => c !== featured);
  const page = rest.slice(0, shown);
  // Agrupados por mix, na ordem.
  const groups: { key: string; title: string; href: string | null; clips: ClipView[] }[] = [];
  for (const c of page) {
    const key = c.mix?.id ?? "sem-mix";
    const g = groups.at(-1);
    if (g && g.key === key) g.clips.push(c);
    else groups.push({ key, title: c.mix?.name ?? "Sem mix", href: c.mix?.href ?? null, clips: [c] });
  }
  const moreHref = () => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ tipo, jogador, mapa, meus: meus ? "1" : null })) if (v) q.set(k, v);
    q.set("mais", String(shown / PAGE + 1));
    return `/clipes?${q}`;
  };

  return (
    <>
      <PageHeader
        title="Clipes e highlights"
        description="Aces, clutches e melhores jogadas dos mixes, direto do Allstar e da Twitch."
        actions={
          <>
            <DemoBadge kind={kind} />
            {canManageMixes && kind === "supabase" && incomplete > 0 && <FillClipsButton count={incomplete} />}
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
      {all.length > 0 && (
        <ClipFilters kinds={kindOptions} players={playerOptions} maps={mapOptions} canMine={!!session} />
      )}
      {featured && (
        <div className="mb-6">
          <ClipCard clip={featured} featured />
        </div>
      )}
      {page.length ? (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={`${g.key}-${g.clips[0]!.id}`}>
              <h2 className="mb-2 flex items-baseline gap-2 font-display text-sm font-semibold tracking-wide uppercase">
                {g.href ? (
                  <Link href={g.href} className="hover:text-brand">
                    {g.title}
                  </Link>
                ) : (
                  g.title
                )}
                <span className="text-xs font-normal tracking-normal text-subtle normal-case">
                  {g.clips.length} clipe{g.clips.length === 1 ? "" : "s"}
                </span>
              </h2>
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {g.clips.map((c) => (
                  <li key={c.id}>
                    <ClipCard clip={c} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {rest.length > shown && (
            <div className="flex justify-center">
              <Link
                href={moreHref()}
                scroll={false}
                className="rounded-md border border-border bg-surface-2 px-4 py-2 text-sm font-medium hover:border-brand hover:text-brand"
              >
                Ver mais clipes ({rest.length - shown})
              </Link>
            </div>
          )}
        </div>
      ) : featured ? null : (
        <Card>
          <EmptyState
            icon={Clapperboard}
            title={anyFilter ? "Nenhum clipe com esses filtros" : "Nenhum clipe ainda"}
            description={
              anyFilter
                ? "Tente outro tipo, jogador ou mapa."
                : "Jogou um mix na GC? O Allstar grava as melhores jogadas sozinho. Copie o link do clipe e envie aqui."
            }
            action={
              anyFilter ? (
                <Link href="/clipes" className="text-sm font-medium text-brand hover:underline">
                  Limpar filtros
                </Link>
              ) : undefined
            }
          />
        </Card>
      )}
    </>
  );
}
