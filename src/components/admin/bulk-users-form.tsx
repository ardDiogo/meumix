"use client";

import { Loader2, UserPlus } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { bulkCreateUsers, type BulkCreateResult } from "@/app/(app)/admin/actions";
import { parseBulkUsers } from "@/lib/bulk-users";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader } from "../ui/card";
import { Input, Label, Textarea } from "../ui/input";

/** Cadastro em lote (master): uma pessoa por linha — nick, nome, e-mail e nível GC opcional. */
export function BulkUsersForm() {
  const [text, setText] = useState("");
  const [password, setPassword] = useState("");
  const [result, setResult] = useState<BulkCreateResult | null>(null);
  const [pending, start] = useTransition();
  const rows = useMemo(() => parseBulkUsers(text), [text]);
  const invalid = rows.filter((r) => r.error);

  return (
    <Card>
      <CardHeader
        title="Cadastrar jogadores"
        description="Cole uma pessoa por linha: nick, nome e e-mail (separados por tab, ; ou |) e, opcionalmente, o nível GC. As contas já nascem confirmadas."
      />
      <CardContent className="space-y-3">
        <Textarea
          aria-label="Lista de jogadores"
          rows={6}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"Nasa\tBruno\tbruno@email.com\nTM\tTiago Melo\ttiago@email.com\t12"}
          className="font-mono text-xs"
        />
        {rows.length > 0 && (
          <p className="text-xs text-muted">
            {rows.length - invalid.length} válido(s)
            {invalid.length > 0 && (
              <span className="text-loss"> · {invalid.map((r) => `linha ${r.line}: ${r.error}`).join(" · ")}</span>
            )}
          </p>
        )}
        <div>
          <Label htmlFor="bulk-password">Senha inicial (mín. 8 caracteres)</Label>
          <Input
            id="bulk-password"
            type="text"
            autoComplete="off"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Envie aos jogadores em particular"
          />
          <p className="mt-1.5 text-xs text-subtle">
            Cada jogador troca a senha em “Alterar senha”, no menu do usuário.
          </p>
        </div>
        <Button
          variant="primary"
          className="w-full"
          disabled={pending || !rows.length || invalid.length > 0 || password.length < 8}
          onClick={() =>
            start(async () => {
              const r = await bulkCreateUsers(text, password);
              setResult(r);
              if (r.ok) {
                toast.success(r.message);
                setText("");
              } else toast.error(r.message);
            })
          }
        >
          {pending ? <Loader2 className="animate-spin" /> : <UserPlus />} Cadastrar {rows.length || ""} jogador(es)
        </Button>
        {result?.rows.length ? (
          <ul className="space-y-0.5 text-xs">
            {result.rows.map((r) => (
              <li
                key={r.email}
                className={r.status === "created" ? "text-win" : r.status === "exists" ? "text-muted" : "text-loss"}
              >
                {r.status === "created" ? "✓ criado" : r.status === "exists" ? "• já existia" : "✗ erro"} — {r.nick} (
                {r.email}){r.detail && `: ${r.detail}`}
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}
