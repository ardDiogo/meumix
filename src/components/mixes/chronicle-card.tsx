import { Newspaper } from "lucide-react";
import { chronicleText, type ChronicleInput } from "@/lib/chronicle";
import { chronicleInProgress, getChronicle } from "@/services/chronicle";
import { Badge } from "../ui/badge";
import { Card } from "../ui/card";
import { ChronicleAdmin, CopyChronicle, GenerateChronicle } from "./chronicle-actions";

/** Converte o *negrito* do WhatsApp em <strong>. */
export function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*[^*\n]+\*)/g).map((part, i) =>
        part.startsWith("*") && part.endsWith("*") && part.length > 2 ? (
          <strong key={i} className="text-fg">
            {part.slice(1, -1)}
          </strong>
        ) : (
          part
        ),
      )}
    </>
  );
}

/** Crônica do mix ("edição sem dó") na página do mix finalizado. */
export async function ChronicleCard({
  matchId,
  meta,
  canManage,
}: {
  matchId: string;
  meta: Pick<ChronicleInput, "date" | "teams" | "maps">;
  canManage: boolean;
}) {
  const stored = await getChronicle(matchId);
  const header = (extra?: React.ReactNode) => (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
      <h2 className="flex items-center gap-2 font-display text-sm font-semibold tracking-wide uppercase">
        <Newspaper className="size-4 text-brand" aria-hidden /> Crônica do mix
        {stored?.content.headline && (
          <span className="font-sans text-xs font-normal tracking-normal text-muted normal-case italic">
            {stored.content.headline}
          </span>
        )}
      </h2>
      {extra}
    </div>
  );

  if (!stored) {
    // Finalizado há pouco: a crônica ainda pode estar sendo escrita.
    const finalizedRecently = await chronicleInProgress(matchId);
    if (!canManage && !finalizedRecently) return null;
    return (
      <Card>
        {header()}
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm text-muted">
          {finalizedRecently
            ? "A crônica está sendo escrita. Recarregue em instantes."
            : "Este mix ainda não tem crônica."}
          {canManage && <GenerateChronicle matchId={matchId} />}
        </div>
      </Card>
    );
  }
  if (stored.hidden && !canManage) return null;

  const c = stored.content;
  return (
    <Card className={stored.hidden ? "opacity-60" : undefined}>
      {header(
        <div className="flex items-center gap-1">
          {stored.hidden && <Badge variant="neutral">Oculta</Badge>}
          {canManage && (
            <Badge variant="neutral">
              {stored.source === "ia" ? "IA" : stored.source === "admin" ? "Editada" : "Modelo"}
            </Badge>
          )}
        </div>,
      )}
      <div className="space-y-3 p-4 text-sm leading-relaxed sm:p-5">
        <p className="text-fg">
          <Rich text={c.intro} />
        </p>
        <ul className="space-y-2.5">
          {c.items.map((it, i) => (
            <li key={i} className="flex gap-2.5">
              <span className="shrink-0 text-base leading-snug" aria-hidden>
                {it.emoji}
              </span>
              <p className="text-muted">
                <strong className="text-fg">{it.title}</strong>: <Rich text={it.text} />
              </p>
            </li>
          ))}
        </ul>
        {c.closing && (
          <p className="border-t border-border pt-3 whitespace-pre-line text-muted">
            <Rich text={c.closing} />
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-1 border-t border-border px-4 py-2.5">
        {canManage && <ChronicleAdmin matchId={matchId} chronicle={c} hidden={stored.hidden} />}
        <CopyChronicle text={chronicleText(c, meta)} />
      </div>
    </Card>
  );
}
