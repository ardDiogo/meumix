import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { LEGAL } from "@/lib/legal";

/** Moldura das páginas legais: título, versão e texto em largura de leitura. */
export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <div className="mx-auto max-w-3xl">
        <PageHeader title={title} description={`Versão ${LEGAL.version} · atualizada em ${LEGAL.updatedAt}`} />
      </div>
      <Card className="mx-auto max-w-3xl px-5 py-6 sm:px-8">
        <div className="space-y-6 text-sm leading-relaxed text-muted [&_a]:text-brand [&_a:hover]:underline [&_strong]:text-fg">
          {children}
        </div>
      </Card>
      <nav className="mx-auto mt-4 flex max-w-3xl flex-wrap gap-x-4 gap-y-1 text-xs text-subtle">
        <Link href="/privacidade" className="hover:text-fg">
          Política de Privacidade
        </Link>
        <Link href="/termos" className="hover:text-fg">
          Termos de Uso
        </Link>
        <Link href="/cookies" className="hover:text-fg">
          Política de Cookies
        </Link>
      </nav>
    </>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="font-display text-base font-semibold text-fg">{title}</h2>
      {children}
    </section>
  );
}

export function ContactEmail() {
  return <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>;
}
