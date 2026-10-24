"use server";

import { revalidatePath } from "next/cache";
import { currentOccurrence } from "@/lib/mix-schedule";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { audit } from "@/services/audit";
import { getSession } from "@/services/auth";
import { toSchedule, type ScheduleRow } from "@/services/mix-events";

export type BolaoResult = { ok: true; message: string } | { ok: false; message: string };
const fail = (message: string): BolaoResult => ({ ok: false, message });

const isInt = (n: unknown, min: number, max: number) =>
  Number.isInteger(n) && (n as number) >= min && (n as number) <= max;

/**
 * Palpite no bolão: qualquer usuário cadastrado (jogando ou não), com os times
 * definidos, até o horário de início do mix. Pode mudar até fechar.
 */
export async function savePrediction(
  scheduleId: string,
  date: string,
  input: { winnerCaptain: string; mapsWon: number; mapsLost: number; mvpId: string | null; lanternaId: string | null },
): Promise<BolaoResult> {
  const session = await getSession();
  if (!session) return fail("Entre na sua conta para palpitar.");
  const admin = createSupabaseAdminClient();
  if (!admin) return fail("Servidor não configurado.");

  const { data: row } = await admin.from("mix_schedules").select("*").eq("id", scheduleId).maybeSingle();
  if (!row) return fail("Este mix não está mais disponível.");
  const occurrence = currentOccurrence(toSchedule(row as ScheduleRow), new Date());
  if (!occurrence || occurrence.date !== date) return fail("Este mix não está mais disponível.");
  if (Date.now() >= occurrence.eventAt.getTime()) return fail("O bolão fechou: o mix já começou.");

  const key = { schedule_id: scheduleId, event_date: date };
  const [{ data: draft }, { data: match }] = await Promise.all([
    admin.from("mix_draft_state").select("status, captain_a, captain_b, team_a, team_b").match(key).maybeSingle(),
    admin.from("mix_matches").select("id").match(key).maybeSingle(),
  ]);
  if (match) return fail("O bolão fechou: o mix já foi finalizado.");
  if (draft?.status !== "completed") return fail("O bolão abre quando os times estiverem definidos.");

  const players = new Set([...(draft.team_a as string[]), ...(draft.team_b as string[])]);
  if (input.winnerCaptain !== draft.captain_a && input.winnerCaptain !== draft.captain_b) {
    return fail("Escolha o time vencedor.");
  }
  if (!isInt(input.mapsWon, 1, 5) || !isInt(input.mapsLost, 0, 4) || input.mapsLost >= input.mapsWon) {
    return fail("Placar inválido.");
  }
  if (input.mapsWon + input.mapsLost > 5) return fail("Placar inválido.");
  if ((input.mvpId && !players.has(input.mvpId)) || (input.lanternaId && !players.has(input.lanternaId))) {
    return fail("Escolha jogadores deste mix.");
  }
  if (input.mvpId && input.mvpId === input.lanternaId) return fail("MVP e lanterna não podem ser o mesmo jogador.");

  const { error } = await admin.from("mix_predictions").upsert(
    {
      ...key,
      user_id: session.id,
      winner_captain: input.winnerCaptain,
      maps_won: input.mapsWon,
      maps_lost: input.mapsLost,
      mvp_id: input.mvpId || null,
      lanterna_id: input.lanternaId || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "schedule_id,event_date,user_id" },
  );
  if (error) {
    return fail(
      error.code === "42P01" ? "Rode a migração 0031_bolao_push.sql no Supabase." : "Não foi possível salvar.",
    );
  }
  await audit({ action: "vote.bolao", outcome: "success", actorId: session.id, scheduleId, eventDate: date });
  revalidatePath("/dashboard");
  revalidatePath("/bolao");
  return { ok: true, message: "Palpite salvo! Dá para mudar até o mix começar." };
}
