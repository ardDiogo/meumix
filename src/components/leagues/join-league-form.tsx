"use client";

import { KeyRound, Loader2, LogIn } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { joinLeagueByCode } from "@/app/(app)/liga/actions";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

/** Código do convite da liga. Com `auto` (link com o código), entra sozinho uma vez. */
export function JoinLeagueForm({ initial = "", auto = false }: { initial?: string; auto?: boolean }) {
  const router = useRouter();
  const [code, setCode] = useState(initial.toUpperCase());
  const [pending, start] = useTransition();
  const tried = useRef(false);
  const join = (value: string) =>
    start(async () => {
      const r = await joinLeagueByCode(value);
      if (!r.ok) {
        toast.error(r.message);
        return;
      }
      toast.success(r.message);
      router.push("/dashboard");
      router.refresh();
    });
  useEffect(() => {
    if (!auto || tried.current || initial.replace(/[^A-Z0-9]/gi, "").length < 6) return;
    tried.current = true;
    join(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, initial]);
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        join(code);
      }}
    >
      <div className="relative">
        <KeyRound className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
        <Input
          aria-label="Código da liga"
          placeholder="CÓDIGO"
          maxLength={8}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          className="w-44 pl-9 font-display tracking-[0.3em] uppercase"
        />
      </div>
      <Button type="submit" variant="primary" disabled={pending || code.replace(/[^A-Z0-9]/gi, "").length < 6}>
        {pending ? <Loader2 className="animate-spin" /> : <LogIn />} {pending ? "Entrando…" : "Entrar na liga"}
      </Button>
    </form>
  );
}
