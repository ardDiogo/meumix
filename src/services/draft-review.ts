import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Time tirado e mudanças na lista (docs/regras-do-mix.md).
 *
 * - Reserva entra ou sai: nada muda.
 * - Seleção em andamento: se sai um capitão ou alguém já escolhido, a seleção
 *   recomeça; se sai alguém ainda não escolhido, o reserva que sobe entra no pool.
 * - Time tirado: quem sai é trocado pelo reserva que sobe, no mesmo time, e os 2
 *   capitães respondem "manter o time" (os dois) ou "tirar novamente" (basta um).
 *   Sem reserva, a vaga fica aberta até alguém entrar. Se sai um capitão, tira de novo.
 */

type Admin = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;
export interface DraftChange {
  out: string | null;
  in: string | null;
  side: "A" | "B";
}

export interface DraftReviewView {
  changes: DraftChange[];
  voteA: boolean | null;
  voteB: boolean | null;
  status: "pending" | "kept";
}

const occ = (scheduleId: string, date: string) => ({ schedule_id: scheduleId, event_date: date });

/** Recomeça a seleção do zero: apaga o time e os palpites e começa de novo (capitães pelos votos). */
export async function redraft(admin: Admin, scheduleId: string, date: string) {
  await admin.from("mix_draft_state").delete().match(occ(scheduleId, date));
  await admin.from("mix_predictions").delete().match(occ(scheduleId, date));
  const { error } = await admin.rpc("draft_start", { p_schedule: scheduleId, p_date: date });
  return !error;
}

/**
 * Ajusta o time depois de uma mudança na lista. Devolve o que aconteceu, para o
 * aviso no celular: "review" (troca aguardando os capitães), "redraft" ou nada.
 */
export async function reconcileTeams(
  admin: Admin,
  scheduleId: string,
  date: string,
): Promise<{ kind: "review"; changes: DraftChange[]; captains: [string, string] } | { kind: "redraft" } | null> {
  const { data: d } = await admin.from("mix_draft_state").select("*").match(occ(scheduleId, date)).maybeSingle();
  if (!d) return null;
  const [{ data: cls }, { data: sched }] = await Promise.all([
    admin.rpc("mix_classified", { p_schedule: scheduleId, p_date: date }),
    admin.from("mix_schedules").select("max_players").eq("id", scheduleId).maybeSingle(),
  ]);
  const classified = new Set((cls as string[] | null) ?? []);
  const half = Math.floor(Number(sched?.max_players ?? 10) / 2);
  const a = [...((d.team_a as string[]) ?? [])];
  const b = [...((d.team_b as string[]) ?? [])];
  const captains = [d.captain_a as string, d.captain_b as string] as [string, string];

  // Capitão fora da lista: tira de novo (com os capitães que os votos apontarem).
  if (captains.some((c) => !classified.has(c))) {
    await redraft(admin, scheduleId, date);
    return { kind: "redraft" };
  }

  if (d.status !== "completed") {
    // Seleção em andamento: saiu alguém já escolhido → recomeça; o resto se ajusta sozinho
    // (quem ainda não foi escolhido sai do pool e o reserva que sobe entra nele).
    if ([...a, ...b].some((id) => !classified.has(id))) {
      await redraft(admin, scheduleId, date);
      return { kind: "redraft" };
    }
    return null;
  }

  const members = new Set([...a, ...b]);
  const out = [...members].filter((id) => !classified.has(id));
  const incoming = [...classified].filter((id) => !members.has(id));
  if (!out.length && !incoming.length) return null;

  const changes: DraftChange[] = [];
  for (const o of out) {
    const side = a.includes(o) ? "A" : "B";
    const team = side === "A" ? a : b;
    const sub = incoming.shift() ?? null;
    if (sub) team[team.indexOf(o)] = sub;
    else team.splice(team.indexOf(o), 1);
    changes.push({ out: o, in: sub, side });
  }
  // Vagas abertas antes (sem reserva na hora) preenchidas por quem entrou agora.
  while (incoming.length && (a.length < half || b.length < half)) {
    const side = a.length < half ? "A" : "B";
    const sub = incoming.shift()!;
    (side === "A" ? a : b).push(sub);
    changes.push({ out: null, in: sub, side });
  }

  const now = new Date().toISOString();
  await admin.from("mix_draft_state").update({ team_a: a, team_b: b, updated_at: now }).match(occ(scheduleId, date));

  // Só pergunta aos capitães quando alguém entrou no time.
  const entered = changes.filter((c) => c.in);
  if (!entered.length) return null;
  const { data: current } = await admin
    .from("mix_draft_reviews")
    .select("changes")
    .match(occ(scheduleId, date))
    .maybeSingle();
  const all = [...(((current?.changes as DraftChange[] | undefined) ?? []) as DraftChange[]), ...changes];
  await admin.from("mix_draft_reviews").upsert(
    {
      ...occ(scheduleId, date),
      changes: all,
      vote_a: null,
      vote_b: null,
      status: "pending",
      updated_at: now,
    },
    { onConflict: "schedule_id,event_date" },
  );
  return { kind: "review", changes, captains };
}

/** Troca aguardando (ou já decidida) dos capitães. Sem a migração 0050: nenhuma. */
export async function loadReview(
  client: { from: Admin["from"] },
  scheduleId: string,
  date: string,
): Promise<DraftReviewView | null> {
  const { data, error } = await client.from("mix_draft_reviews").select("*").match(occ(scheduleId, date)).maybeSingle();
  if (error || !data) return null;
  return {
    changes: (data.changes as DraftChange[]) ?? [],
    voteA: (data.vote_a as boolean | null) ?? null,
    voteB: (data.vote_b as boolean | null) ?? null,
    status: data.status as DraftReviewView["status"],
  };
}
