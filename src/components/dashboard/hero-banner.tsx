import Image from "next/image";
import hero from "../../../public/brand/hero.webp";

/** Banner do topo do Dashboard com a arte do MeuMix. */
export function HeroBanner({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: React.ReactNode;
}) {
  return (
    <section className="relative -mx-4 -mt-6 mb-6 overflow-hidden border-b border-border sm:mx-0 sm:mt-0 sm:rounded-xl sm:border">
      <Image
        src={hero}
        alt=""
        fill
        priority
        placeholder="blur"
        sizes="(min-width: 1280px) 1232px, 100vw"
        className="object-cover object-[70%_center]"
      />
      {/* Escurece a esquerda para o texto ficar legível. */}
      <div className="absolute inset-0 bg-gradient-to-r from-bg via-bg/80 to-transparent sm:via-bg/60" aria-hidden />
      <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-bg/80 to-transparent" aria-hidden />
      <div className="relative flex min-h-56 flex-col justify-end gap-3 px-5 py-6 sm:min-h-72 sm:px-8 sm:py-8 lg:min-h-80">
        {eyebrow && <p className="text-sm font-semibold tracking-wide text-brand uppercase">{eyebrow}</p>}
        <h1 className="max-w-xl font-display text-3xl leading-tight font-bold sm:text-4xl lg:text-5xl">{title}</h1>
        <p className="max-w-md text-sm text-muted sm:text-base">{description}</p>
        {actions && <div className="mt-1 flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </section>
  );
}
