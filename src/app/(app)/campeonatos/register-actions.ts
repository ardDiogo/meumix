"use server";

import { revalidatePath } from "next/cache";
import { missing, MIGRATION } from "@/lib/championship";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { audit } from "@/services/audit";
import { getSession } from "@/services/auth";
import { requireOrganizer } from "@/services/championship-guard";

/**
 * Inscrição feita pelo próprio jogador (botão "Inscrever-se" do Dashboard e da
 * página do campeonato). Só no campeonato por draft com status "Aguardando
 * inscrições"; no campeonato por código, a inscrição é entrar no time pelo código.
 */

export type RegisterResult = { ok: boolean; message: string };

const validId = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

function refresh() {
  revalidatePath("/campeonatos", "layout");
  revalidatePath("/dashboard");
}

async function open(championshipId: string) {
  const session = await getSession();
  if (!session) return { error: "Entre na sua conta para se inscrever." } as const;
  if (!validId(championshipId)) return { error: "Campeonato inválido." } as const;
  const admin = createSupabaseAdminClient();
  if (!admin) return { error: "O banco de dados não está configurado no servidor." } as const;
  const { data, error } = await admin.from("championships").select("*").eq("id", championshipId).maybeSingle();
  if (error) return { error: missing(error.code) ? MIGRATION : "Não foi possível carregar o campeonato." } as const;
  if (!data) return { error: "Campeonato não encontrado." } as const;
  const c = data as Record<string, unknown>;
  if (c.team_mode === "code")
    return { error: "Neste campeonato você entra pelo código do seu time (aba Equipes)." } as const;
  if (c.status !== "registration") return { error: "As inscrições deste campeonato não estão abertas." } as const;
  const { data: draft } = await admin
    .from("championship_drafts")
    .select("status")
    .eq("championship_id", championshipId)
    .maybeSingle();
  if (draft) return { error: "O draft já começou: as inscrições estão fechadas." } as const;
  return {
    session,
    admin,
    name: c.name as string,
    vagas: Number(c.team_count) * Number(c.players_per_team),
  } as const;
}

/** Inscreve a pessoa logada (até completar as vagas). */
export async function registerSelf(championshipId: string): Promise<RegisterResult> {
  const r = await open(championshipId);
  if ("error" in r) return { ok: false, message: r.error ?? "Não foi possível inscrever." };
  const { data: current, error } = await r.admin
    .from("championship_players")
    .select("user_id")
    .eq("championship_id", championshipId);
  if (error) return { ok: false, message: "Não foi possível inscrever." };
  if ((current ?? []).some((p) => p.user_id === r.session.id))
    return { ok: true, message: `Você já está inscrito no ${r.name}.` };
  if ((current ?? []).length >= r.vagas) return { ok: false, message: "As vagas já foram preenchidas." };
  const { error: insertError } = await r.admin
    .from("championship_players")
    .upsert(
      { championship_id: championshipId, user_id: r.session.id },
      { onConflict: "championship_id,user_id", ignoreDuplicates: true },
    );
  if (insertError) return { ok: false, message: "Não foi possível inscrever." };
  await audit({
    action: "championship.self_register",
    outcome: "success",
    actorId: r.session.id,
    detail: { championshipId },
  });
  refresh();
  return { ok: true, message: `Inscrição feita no ${r.name}! O pagamento é combinado com a organização.` };
}

/** Cancela a própria inscrição (antes do draft; capitão precisa ser trocado antes). */
export async function unregisterSelf(championshipId: string): Promise<RegisterResult> {
  const r = await open(championshipId);
  if ("error" in r) return { ok: false, message: r.error ?? "Não foi possível cancelar." };
  const { data: captain } = await r.admin
    .from("championship_teams")
    .select("name")
    .eq("championship_id", championshipId)
    .eq("captain_id", r.session.id)
    .maybeSingle();
  if (captain)
    return { ok: false, message: `Você é o capitão do ${captain.name}: peça à organização para trocar o capitão.` };
  const { error } = await r.admin
    .from("championship_players")
    .delete()
    .eq("championship_id", championshipId)
    .eq("user_id", r.session.id);
  if (error) return { ok: false, message: "Não foi possível cancelar." };
  await audit({
    action: "championship.self_unregister",
    outcome: "success",
    actorId: r.session.id,
    detail: { championshipId },
  });
  refresh();
  return { ok: true, message: "Inscrição cancelada." };
}

/** Organização: abre as inscrições (status "Aguardando inscrições") com um clique, do Dashboard. */
export async function openRegistrations(championshipId: string): Promise<RegisterResult> {
  const r = await requireOrganizer(championshipId);
  if ("error" in r) return { ok: false, message: r.error ?? "Não foi possível abrir as inscrições." };
  if (r.ch.status !== "setup") return { ok: false, message: "O campeonato já saiu da configuração." };
  const { error } = await r.admin
    .from("championships")
    .update({ status: "registration", updated_at: new Date().toISOString() })
    .eq("id", championshipId);
  if (error) return { ok: false, message: "Não foi possível abrir as inscrições." };
  await audit({
    action: "championship.update",
    outcome: "success",
    actorId: r.session.id,
    detail: { slug: r.ch.slug, status: "registration" },
  });
  refresh();
  return { ok: true, message: "Inscrições abertas! O botão Inscrever-se já aparece para todos." };
}
