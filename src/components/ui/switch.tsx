"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** Interruptor liga/desliga acessível. */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
  pending,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
  pending?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled || pending}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors disabled:opacity-60",
        checked ? "border-brand bg-brand" : "border-border-strong bg-surface-3",
      )}
    >
      {pending ? (
        <Loader2 className="mx-auto size-3.5 animate-spin" />
      ) : (
        <span
          className={cn(
            "inline-block size-4 rounded-full bg-fg transition-transform",
            checked ? "translate-x-6" : "translate-x-1",
          )}
        />
      )}
    </button>
  );
}
