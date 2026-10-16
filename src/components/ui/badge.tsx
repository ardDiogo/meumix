import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide leading-none [&_svg]:size-3",
  {
    variants: {
      variant: {
        neutral: "bg-surface-2 text-muted border border-border",
        brand: "bg-brand/12 text-brand border border-brand/30",
        win: "bg-win/12 text-win border border-win/25",
        loss: "bg-loss/12 text-loss border border-loss/25",
        draw: "bg-draw/12 text-draw border border-draw/25",
        demo: "bg-transparent text-muted border border-dashed border-border-strong",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
