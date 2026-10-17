"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { changePassword, deleteMyAccount } from "@/app/(app)/conta/actions";
import { PASSWORD_MIN } from "@/lib/auth/validation";
import { Button } from "../ui/button";
import { Input, Label } from "../ui/input";

/** Troca de senha pedindo a senha atual. */
export function ChangePasswordForm() {
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [pending, start] = useTransition();
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await changePassword(form.current, form.next, form.confirm);
          if (r.ok) {
            toast.success(r.message);
            setForm({ current: "", next: "", confirm: "" });
          } else toast.error(r.message);
        });
      }}
    >
      <div>
        <Label htmlFor="pw-current">Senha atual</Label>
        <Input
          id="pw-current"
          type="password"
          autoComplete="current-password"
          value={form.current}
          onChange={set("current")}
        />
      </div>
      <div>
        <Label htmlFor="pw-next">Nova senha</Label>
        <Input
          id="pw-next"
          type="password"
          autoComplete="new-password"
          placeholder={`Mínimo de ${PASSWORD_MIN} caracteres`}
          value={form.next}
          onChange={set("next")}
        />
      </div>
      <div>
        <Label htmlFor="pw-confirm">Confirmar nova senha</Label>
        <Input
          id="pw-confirm"
          type="password"
          autoComplete="new-password"
          value={form.confirm}
          onChange={set("confirm")}
        />
      </div>
      <Button
        type="submit"
        variant="primary"
        className="w-full"
        disabled={pending || !form.current || !form.next || !form.confirm}
      >
        {pending && <Loader2 className="animate-spin" />} Alterar senha
      </Button>
    </form>
  );
}

/** Exclusão da própria conta: senha + digitar EXCLUIR. */
export function DeleteAccountForm({ disabledReason }: { disabledReason?: string }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [pending, start] = useTransition();
  const ready = !!password && confirmation.trim().toUpperCase() === "EXCLUIR";

  if (disabledReason) return <p className="text-sm text-muted">{disabledReason}</p>;
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await deleteMyAccount(password, confirmation);
          if (r.ok) {
            toast.success("Sua conta foi excluída.");
            window.location.assign("/dashboard");
          } else toast.error(r.message);
        });
      }}
    >
      <div>
        <Label htmlFor="del-password">Sua senha</Label>
        <Input
          id="del-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <div>
        <Label htmlFor="del-confirm">
          Digite <strong className="text-fg">EXCLUIR</strong> para confirmar
        </Label>
        <Input
          id="del-confirm"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          autoComplete="off"
        />
      </div>
      <Button type="submit" variant="danger" className="w-full" disabled={pending || !ready}>
        {pending ? <Loader2 className="animate-spin" /> : <Trash2 />} Excluir minha conta permanentemente
      </Button>
    </form>
  );
}
