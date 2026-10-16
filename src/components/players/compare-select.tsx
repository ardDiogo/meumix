"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Select } from "../ui/input";

export function CompareSelect({ options, value }: { options: { id: string; label: string }[]; value: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  return (
    <div className="relative w-full sm:w-56">
      <Select
        aria-label="Jogador para comparar"
        value={value ?? ""}
        onChange={(e) => {
          const id = e.target.value;
          start(() => router.replace(id ? `${pathname}?comparar=${id}` : pathname, { scroll: false }));
        }}
      >
        <option value="">Selecione…</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </Select>
      {pending && <Loader2 className="absolute top-1/2 right-8 size-4 -translate-y-1/2 animate-spin text-muted" />}
    </div>
  );
}
