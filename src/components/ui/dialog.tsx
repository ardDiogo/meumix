"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  title,
  description,
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & { title: React.ReactNode; description?: React.ReactNode }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/70 data-[state=open]:animate-fade-in" />
      <DialogPrimitive.Content
        aria-describedby={undefined}
        className={cn(
          "fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-surface p-5 shadow-2xl shadow-black/50 focus:outline-none data-[state=open]:animate-fade-in",
          className,
        )}
        {...props}
      >
        <DialogPrimitive.Title className="font-display text-lg font-bold">{title}</DialogPrimitive.Title>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
        <div className="mt-4">{children}</div>
        <DialogPrimitive.Close className="absolute top-3 right-3 rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-fg">
          <X className="size-4" />
          <span className="sr-only">Fechar</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
