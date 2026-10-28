import "server-only";
import { currentOccurrence } from "@/lib/mix-schedule";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { bolaoPointsForMatch } from "./bolao";
import { toSchedule, type ScheduleRow } from "./mix-events";
import { sendPush } from "./push";
import { twitchChannelUrl } from "@/lib/twitch";
import { liveChannels } from "./twitch";

/**
 * Avisos do MeuMix no celular, disparados pelos acontecimentos do mix. Todos
 * são "melhor esforço": chamados com `after()` e nunca derrubam a ação.
 */

const TZ = "America/Sao_Paulo";
const hourMin = (d: Date) => d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
const dayMonth = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;

async function nameMap(ids: string[]) {
  const admin = createSupabaseAdminClient();
  if (!admin || !ids.length) return new Map<string, string>();
  const { data } = await admin.from("profiles").select("id, display_name").in("id", ids);
  return new Map((data ?? []).map((p) => [p.id as string, p.display_name as string]));
}

async function draftOf(scheduleId: string, date: string) {
  const admin = createSupabaseAdminClient();
  if (!admin) return null;
  const { data } = await admin
    .from("mix_draft_state")
    .select("status, captain_a, captain_b, team_a, team_b")
    .match({ schedule_id: scheduleId, event_date: date })
    .maybeSingle();
  return data as {
    status: string;
    captain_a: string;
    captain_b: string;
    team_a: string[];
    team_b: string[];
  } | null;
}

/** Classificados do mix (os primeiros inscritos, até o limite de vagas). */
async function classifiedOf(scheduleId: string, date: string) {
  const admin = createSupabaseAdminClient();
  if (!admin) return [];
  const [{ data: schedule }, { data: regs }] = await Promise.all([
    admin.from("mix_schedules").select("max_players").eq("id", scheduleId).maybeSingle(),
    admin
      .from("mix_registrations")
      .select("user_id")
      .match({ schedule_id: scheduleId, event_date: date })
      .order("created_at"),
  ]);
  return (regs ?? []).slice(0, (schedule?.max_players as number) ?? 10).map((r) => r.user_id as string);
}

/** Lista fechou (10 classificados): chama todos para votar em capitães e mapas. */
export async function notifyListFull(scheduleId: string, date: string) {
  const classified = await classifiedOf(scheduleId, date);
  await sendPush(
    { topic: "pick", userIds: classified, once: `lista-cheia:${scheduleId}:${date}` },
    {
      title: "Lista fechada! Hora de votar 🗳️",
      body: `${classified.length} classificados para o mix de ${dayMonth(date)}. Vote nos capitães e nos mapas.`,
      tag: `votacao:${date}`,
    },
  );
}

/** Disputa de capitães começou: avisa os dois capitães e conta para o resto do mix. */
export async function notifyCaptains(scheduleId: string, date: string) {
  const draft = await draftOf(scheduleId, date);
  if (!draft || draft.status === "completed") return;
  const names = await nameMap([draft.captain_a, draft.captain_b]);
  // Capitães trocados (super admin): avisa de novo com a dupla nova.
  const pair = [draft.captain_a, draft.captain_b].sort().join(":");
  await Promise.all(
    [
      [draft.captain_a, draft.captain_b],
      [draft.captain_b, draft.captain_a],
    ].map(([me, rival]) =>
      sendPush(
        { topic: "pick", userIds: [me!], once: `capitao:${scheduleId}:${date}:${me}:${pair}` },
        {
          title: "Você é capitão! 👑",
          body: `Pedra, papel ou tesoura contra ${names.get(rival!) ?? "o outro capitão"} para ver quem escolhe primeiro.`,
          tag: `pick:${date}`,
        },
      ),
    ),
  );
  const others = (await classifiedOf(scheduleId, date)).filter((u) => u !== draft.captain_a && u !== draft.captain_b);
  await sendPush(
    { topic: "pick", userIds: others, once: `capitaes:${scheduleId}:${date}:${pair}` },
    {
      title: "Capitães definidos 👑",
      body: `${names.get(draft.captain_a) ?? "Capitão A"} × ${names.get(draft.captain_b) ?? "Capitão B"}. Agora é o pedra, papel ou tesoura e o PICK.`,
      tag: `pick:${date}`,
    },
  );
}

/** Capitão escolheu alguém: avisa o escolhido. */
export async function notifyPicked(scheduleId: string, date: string, playerId: string, captainId: string) {
  const names = await nameMap([captainId]);
  await sendPush(
    { topic: "pick", userIds: [playerId], once: `pick:${scheduleId}:${date}:${playerId}` },
    {
      title: "Você foi escolhido! 🎯",
      body: `${names.get(captainId) ?? "O capitão"} te pegou para o Time ${names.get(captainId) ?? ""}.`.trim(),
      tag: `pick:${date}`,
    },
  );
}

/** Ordem do PICK: o 1º capitão escolhe 1, depois 2, 2, 2 e o último 1 (0005_draft.sql). */
const TURN_PATTERN = [1, 2, 2, 2, 1];

/**
 * Rodada do PICK concluída: todos do mix recebem um aviso numerado com os
 * escolhidos da rodada ("2. detonic pickou paiked1 e Nasa"). Um aviso por
 * rodada, sem substituir os anteriores.
 */
export async function notifyPickTurn(
  scheduleId: string,
  date: string,
  state: {
    captain_a: string;
    captain_b: string;
    team_a: string[];
    team_b: string[];
    turn_number: number;
    picks_in_turn: number;
  },
  captainId: string,
) {
  // A rodada só fecha quando o contador volta a zero (o banco já passou para a próxima).
  if (state.picks_in_turn !== 0 || state.turn_number < 1) return;
  const turn = state.turn_number;
  const size = TURN_PATTERN[turn - 1] ?? 1;
  const team = captainId === state.captain_a ? state.team_a : state.team_b;
  const picked = team.slice(-size);
  if (!picked.length) return;
  const names = await nameMap([captainId, ...picked]);
  const who = picked.map((id) => names.get(id) ?? "Jogador");
  const list = who.length > 1 ? `${who.slice(0, -1).join(", ")} e ${who.at(-1)}` : who[0]!;
  await sendPush(
    {
      topic: "pick",
      userIds: await classifiedOf(scheduleId, date),
      once: `picklog:${scheduleId}:${date}:${turn}:${picked.join(",")}`,
    },
    {
      title: `${turn}. ${names.get(captainId) ?? "Capitão"} pickou ${list}`,
      body: `PICK do mix de ${dayMonth(date)} · rodada ${turn} de ${TURN_PATTERN.length}.`,
      tag: `picklog:${date}:${turn}`,
    },
  );
}

/** Identificador curto da formação dos times (para a chave do aviso). */
function teamsKey(a: string[], b: string[]) {
  const text = [[...a].sort().join(","), [...b].sort().join(",")].sort().join("|");
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

/** Times definidos (PICK concluído ou sugestão aceita): abre o bolão para todos. */
export async function notifyTeamsDefined(scheduleId: string, date: string) {
  const draft = await draftOf(scheduleId, date);
  if (draft?.status !== "completed") return;
  const names = await nameMap([draft.captain_a, draft.captain_b]);
  await sendPush(
    // Um aviso por formação de times: se o PICK for refeito, o bolão reabre e avisa de novo.
    { topic: "bolao", once: `bolao-abre:${scheduleId}:${date}:${teamsKey(draft.team_a, draft.team_b)}` },
    {
      title: "Times definidos! Bolão aberto 🎲",
      body: `Time ${names.get(draft.captain_a) ?? "A"} × Time ${names.get(draft.captain_b) ?? "B"}. Quem vence? Palpite até o mix começar.`,
      tag: `bolao:${date}`,
    },
  );
}

/** Mix finalizado: cada jogador recebe o resultado e o ELO; cada palpiteiro, os pontos do bolão. */
export async function notifyMixResult(matchId: string) {
  const admin = createSupabaseAdminClient();
  if (!admin) return;
  const [{ data: match }, { data: records }] = await Promise.all([
    admin.from("mix_matches").select("event_date, maps").eq("id", matchId).maybeSingle(),
    admin
      .from("player_match_records")
      .select("user_id, team, elo_before, elo_after, is_mvp, is_lanterna")
      .eq("match_id", matchId)
      .not("user_id", "is", null),
  ]);
  if (!match) return;
  let a = 0;
  let b = 0;
  for (const m of (match.maps as { score_a: number | null; score_b: number | null }[]) ?? []) {
    if (m.score_a == null || m.score_b == null || m.score_a === m.score_b) continue;
    if (m.score_a > m.score_b) a++;
    else b++;
  }
  const date = dayMonth(match.event_date as string);
  const url = `/mixes/${matchId}`;

  await Promise.all(
    (records ?? []).map((r) => {
      const mine = r.team === "A" ? a : b;
      const theirs = r.team === "A" ? b : a;
      const result = mine > theirs ? "Vitória" : mine < theirs ? "Derrota" : "Empate";
      const before = r.elo_before as number | null;
      const after = r.elo_after as number | null;
      const diff = before != null && after != null ? after - before : null;
      const elo = diff == null ? "Resultado lançado." : `ELO ${before} → ${after} (${diff > 0 ? "+" : ""}${diff}).`;
      const extra = r.is_mvp ? " Você foi o MVP! 🏆" : r.is_lanterna ? " Lanterna da noite 🔦" : "";
      return sendPush(
        { topic: "resultado", userIds: [r.user_id as string], once: `resultado:${matchId}:${r.user_id}` },
        { title: `${result} ${mine}×${theirs} no mix de ${date}`, body: elo + extra, url, tag: `resultado:${matchId}` },
      );
    }),
  );

  const points = await bolaoPointsForMatch(matchId);
  await Promise.all(
    points.map((p) =>
      sendPush(
        { topic: "resultado", userIds: [p.userId], once: `bolao-pontos:${matchId}:${p.userId}` },
        {
          title: "Bolão conferido 🎲",
          body: p.points
            ? `Você fez ${p.points} ponto${p.points > 1 ? "s" : ""} no mix de ${date}.`
            : `Não foi dessa vez: 0 pontos no mix de ${date}.`,
          url: "/bolao",
          tag: `bolao-pontos:${matchId}`,
        },
      ),
    ),
  );
}

const MIN = 60_000;

/**
 * Avisos por horário (chamado a cada poucos minutos por /api/cron/avisos):
 * inscrições abrindo, vagas sobrando, bolão fechando e lives da Twitch.
 * Cada aviso sai uma vez só (push_log).
 */
export async function runScheduledNotices(now = new Date()) {
  const admin = createSupabaseAdminClient();
  if (!admin) return { ok: false as const, message: "Banco não configurado." };
  const [{ data: schedules }, { data: skips }] = await Promise.all([
    admin.from("mix_schedules").select("*").eq("active", true),
    admin.from("mix_skips").select("schedule_id, event_date"),
  ]);
  const skipped = new Set((skips ?? []).map((s) => `${s.schedule_id}|${s.event_date}`));
  let sent = 0;

  for (const row of (schedules ?? []) as ScheduleRow[]) {
    const schedule = toSchedule(row);
    const o = currentOccurrence(schedule, now, (d) => skipped.has(`${schedule.id}|${d}`));
    if (!o) continue;
    const key = `${schedule.id}:${o.date}`;
    const toOpen = o.opensAt.getTime() - now.getTime();
    const toStart = o.eventAt.getTime() - now.getTime();

    // Inscrições abrem em até 15 minutos.
    if (toOpen > 0 && toOpen <= 15 * MIN) {
      sent += await sendPush(
        { topic: "inscricoes", once: `abre:${key}` },
        {
          title: `Inscrições abrem às ${hourMin(o.opensAt)} ⏰`,
          body: `Mix de ${dayMonth(o.date)} às ${hourMin(o.eventAt)}. Fique pronto: as vagas vão por ordem de chegada.`,
          tag: `inscricoes:${o.date}`,
        },
      );
    }

    if (toStart <= 0 || toStart > 60 * MIN) continue;
    const match = { schedule_id: schedule.id, event_date: o.date };
    const [{ data: regs }, { data: done }, draft] = await Promise.all([
      admin.from("mix_registrations").select("user_id").match(match),
      admin.from("mix_matches").select("id").match(match).maybeSingle(),
      draftOf(schedule.id, o.date),
    ]);
    if (done) continue;
    const registered = (regs ?? []).map((r) => r.user_id as string);

    // Falta 1 hora e ainda tem vaga.
    const left = schedule.maxPlayers - registered.length;
    if (left > 0 && now >= o.opensAt) {
      sent += await sendPush(
        { topic: "inscricoes", exclude: registered, once: `vagas:${key}` },
        {
          title: `Faltam ${left} vaga${left > 1 ? "s" : ""} para o mix das ${hourMin(o.eventAt)} 🔥`,
          body: "Corre que ainda dá tempo de entrar.",
          tag: `inscricoes:${o.date}`,
        },
      );
    }

    // Bolão fecha em até 1 hora: lembra quem ainda não palpitou.
    if (draft?.status === "completed") {
      const { data: bets } = await admin.from("mix_predictions").select("user_id").match(match);
      sent += await sendPush(
        {
          topic: "bolao",
          exclude: (bets ?? []).map((b) => b.user_id as string),
          once: `bolao-fecha:${key}`,
        },
        {
          title: `Bolão fecha às ${hourMin(o.eventAt)} 🎲`,
          body: "Você ainda não palpitou. Quem vence, qual o placar, quem é o MVP e quem fica de lanterna?",
          tag: `bolao:${o.date}`,
        },
      );
    }
  }

  // Lives da Twitch (um aviso por live).
  for (const live of await liveChannels()) {
    const names = await nameMap([live.playerId]);
    sent += await sendPush(
      { topic: "live", exclude: [live.playerId], once: `live:${live.login}:${live.startedAt}` },
      {
        title: `${names.get(live.playerId) ?? live.login} está ao vivo na Twitch 🔴`,
        body: live.title || "Vem assistir!",
        url: twitchChannelUrl(live.login),
        tag: `live:${live.login}`,
      },
    );
  }
  return { ok: true as const, sent };
}
