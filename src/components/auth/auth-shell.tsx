import { Logo } from "../brand/logo";

/** Moldura das telas de acesso: logo centralizado e card. */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_50%_0%,rgb(255_106_0/0.08),transparent)]"
      />
      <Logo height={44} className="relative mb-8" />
      <div className="relative w-full max-w-[420px] rounded-lg border border-border bg-surface p-6 shadow-2xl shadow-black/40 sm:p-8">
        {children}
      </div>
      <p className="relative mt-6 text-center text-xs text-subtle">Plataforma de mixes competitivos de CS2</p>
    </main>
  );
}
