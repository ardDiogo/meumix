import Image from "next/image";
import { cn } from "@/lib/utils";

/** Lanterna do lanterna do mix (a óleo, 3D, com o laranja do MeuMix). */
export function Lantern({ className, glow = true }: { className?: string; glow?: boolean }) {
  return (
    <Image
      src="/brand/lanterna.svg"
      alt=""
      aria-hidden
      width={64}
      height={80}
      unoptimized
      className={cn("inline-block object-contain", glow && "drop-shadow-[0_0_8px_rgba(249,115,22,0.75)]", className)}
    />
  );
}

/** A lanterna no canto inferior direito da foto (como a coroa do MVP fica em cima). */
export function LanternCorner({ className }: { className?: string }) {
  return (
    <Lantern
      className={cn(
        "pointer-events-none absolute -right-4 -bottom-4 size-11 drop-shadow-[0_3px_4px_rgba(0,0,0,0.8)] sm:-right-5 sm:-bottom-5 sm:size-14",
        className,
      )}
    />
  );
}
