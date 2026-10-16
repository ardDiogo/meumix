"use client";

import { Loader2, Save } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveLevels } from "@/app/(app)/admin/config-actions";
import { validateLevels, type LevelDef } from "@/lib/levels";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Table, TD, TH, THead, TR } from "../ui/table";

export function LevelsEditor({ levels, canEdit }: { levels: LevelDef[]; canEdit: boolean }) {
  const [rows, setRows] = useState(levels);
  const [pending, start] = useTransition();
  const changed = JSON.stringify(rows) !== JSON.stringify(levels);
  const error = changed ? validateLevels(rows) : null;

  const update = (i: number, patch: Partial<LevelDef>) =>
    setRows((list) =>
      list.map((r, j) => {
        if (j === i) return { ...r, ...patch };
        // O mínimo do próximo nível acompanha o máximo deste.
        if (j === i + 1 && patch.max !== undefined) return { ...r, min: patch.max + 1 };
        return r;
      }),
    );

  return (
    <div className="space-y-3 px-4 pb-4">
      <div className="overflow-hidden rounded-lg border border-border">
        <Table>
          <THead>
            <TR>
              <TH>Nível</TH>
              <TH>ELO mínimo</TH>
              <TH>ELO máximo</TH>
              <TH>GAP</TH>
              <TH>Cor</TH>
            </TR>
          </THead>
          <tbody>
            {rows.map((l, i) => (
              <TR key={l.level}>
                <TD className="font-display font-bold">{l.level}</TD>
                <TD>
                  <Input
                    aria-label={`ELO mínimo do nível ${l.level}`}
                    type="number"
                    inputMode="numeric"
                    value={l.min}
                    disabled={!canEdit || i === 0}
                    onChange={(e) => update(i, { min: Number(e.target.value) })}
                    className="w-24 tabular"
                  />
                </TD>
                <TD>
                  <Input
                    aria-label={`ELO máximo do nível ${l.level}`}
                    type="number"
                    inputMode="numeric"
                    value={l.max}
                    disabled={!canEdit}
                    onChange={(e) => update(i, { max: Number(e.target.value) })}
                    className="w-24 tabular"
                  />
                </TD>
                <TD className="text-muted tabular">{l.max - l.min}</TD>
                <TD>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      aria-label={`Cor do nível ${l.level}`}
                      value={/^#[0-9a-f]{6}$/i.test(l.color) ? l.color : "#000000"}
                      disabled={!canEdit}
                      onChange={(e) => update(i, { color: e.target.value.toUpperCase() })}
                      className="size-7 shrink-0 cursor-pointer rounded-full border-0 bg-transparent p-0 disabled:cursor-default [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0"
                    />
                    <Input
                      aria-label={`Código da cor do nível ${l.level}`}
                      value={l.color}
                      disabled={!canEdit}
                      maxLength={7}
                      onChange={(e) => update(i, { color: e.target.value })}
                      className="w-28 font-mono text-xs"
                    />
                  </div>
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </div>
      {error && (
        <p role="alert" className="text-sm text-loss">
          {error}
        </p>
      )}
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-subtle">
          {canEdit
            ? "Ao salvar, o nível de todos os jogadores é recalculado pelo ELO atual."
            : "Somente o master pode alterar os níveis."}
        </p>
        {canEdit && (
          <div className="flex gap-2">
            {changed && (
              <Button variant="ghost" disabled={pending} onClick={() => setRows(levels)}>
                Desfazer
              </Button>
            )}
            <Button
              variant="primary"
              disabled={!changed || !!error || pending}
              onClick={() =>
                start(async () => {
                  const r = await saveLevels(rows);
                  if (r.ok) toast.success(r.message);
                  else toast.error(r.message);
                })
              }
            >
              {pending ? <Loader2 className="animate-spin" /> : <Save />} Salvar alterações
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
