import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";
import logo from "../../../public/brand/logo.png";
import simbolo from "../../../public/brand/simbolo.png";

/** Símbolo "M" da marca, para espaços pequenos. */
export function LogoMark({ className, size = 28 }: { className?: string; size?: number }) {
  return <Image src={simbolo} alt="" width={size} height={size} className={className} aria-hidden />;
}

/** Logo completo (símbolo + "meumix"). */
export function Logo({
  href = "/dashboard",
  height = 30,
  className,
}: {
  href?: string;
  height?: number;
  className?: string;
}) {
  return (
    <Link href={href} className={cn("inline-flex items-center rounded-md", className)} aria-label="MeuMix — início">
      <Image src={logo} alt="MeuMix" height={height} width={Math.round((logo.width / logo.height) * height)} priority />
    </Link>
  );
}
