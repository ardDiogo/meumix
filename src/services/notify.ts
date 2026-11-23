import "server-only";
import { starterRule } from "@/services/starters";
import { queueOrder } from "@/lib/strikes";
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
    .select("status, captain_a, captain_b, team_a, team_b, current_turn")
    .match({ schedule_id: scheduleId, event_date: date })
    .maybeSingle();
  return data as {
    status: string;
    current_turn: "a" | "b" | null;
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
      .select("*")
      .match({ schedule_id: scheduleId, event_date: date })
      .order("created_at"),
  ]);
  return queueOrder(regs ?? [])
    .slice(0, (schedule?.max_players as number) ?? 10)
    .map((r) => r.user_id as string);
}

/**
 * Lista cheia: chama para votar cada classificado que ainda não foi chamado neste mix.
 * Na 1ª vez, os 10; depois, quem entrou na lista (reserva que subiu ou quem ocupou uma
 * vaga aberta). Um aviso por pessoa e por mix, mesmo com inscrições ao mesmo tempo.
 */
export async function notifyVoteCall(scheduleId: string, date: string) {
  const admin = createSupabaseAdminClient();
  if (!admin) return;
  const [{ data: schedule }, classified, draft] = await Promise.all([
    admin.from("mix_schedules").select("max_players").eq("id", scheduleId).maybeSingle(),
    classifiedOf(scheduleId, date),
    draftOf(scheduleId, date),
  ]);
  const max = (schedule?.max_players as number) ?? 10;
  if (classified.length < max) return;
  // Com a seleção de equipes já começada, os votos de capitão estão encerrados: só mapas.
  const body = draft
    ? `Você está na lista do mix de ${dayMonth(date)}. Vote nos mapas.`
    : `Você está entre os ${max} do mix de ${dayMonth(date)}. Vote nos capitães e nos mapas.`;
  await Promise.all(
    classified.map((userId) =>
      sendPush(
        { topic: "pick", userIds: [userId], once: `votar:${scheduleId}:${date}:${userId}` },
        { title: "Lista fechada! Hora de votar 🗳️", body, tag: `votacao:${date}` },
      ),
    ),
  );
}

/** Classificados que ainda não votaram: nos capitães (antes da seleção começar) e/ou nos mapas. */
async function pendingVoters(scheduleId: string, date: string, classified: string[], draftStarted: boolean) {
  const admin = createSupabaseAdminClient();
  if (!admin || !classified.length) return [];
  const match = { schedule_id: scheduleId, event_date: date };
  const [{ data: caps }, { data: maps }] = await Promise.all([
    admin.from("captain_votes").select("voter_id").match(match),
    admin.from("map_votes").select("user_id").match(match),
  ]);
  const capVoters = new Set((caps ?? []).map((v) => v.voter_id as string));
  const mapVoters = new Set((maps ?? []).map((v) => v.user_id as string));
  return classified
    .map((userId) => ({
      userId,
      captains: !draftStarted && !capVoters.has(userId),
      maps: !mapVoters.has(userId),
    }))
    .filter((p) => p.captains || p.maps);
}

/** Texto do lembrete conforme o que falta votar. */
function voteReminder(p: { captains: boolean; maps: boolean }, eventAt: Date) {
  const what = p.captains && p.maps ? "nos capitães e nos mapas" : p.captains ? "nos capitães" : "nos mapas";
  const why = p.captains ? " A seleção de equipes só começa quando todos os classificados votarem." : "";
  return {
    title: "Falta o seu voto 🗳️",
    body: `Vote ${what} do mix das ${hourMin(eventAt)}.${why}`,
  };
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
  const [{ data: match }, { data: records }, leagueHistory] = await Promise.all([
    admin.from("mix_matches").select("event_date, maps").eq("id", matchId).maybeSingle(),
    admin
      .from("player_match_records")
      .select("id, user_id, team, elo_before, elo_after, is_mvp, is_lanterna")
      .eq("match_id", matchId)
      .not("user_id", "is", null),
    admin.from("league_elo_history").select("record_id, elo_before, elo_after").eq("match_id", matchId),
  ]);
  if (!match) return;
  // ELO da liga do mix (sem a migração 0046: o gravado no registro).
  const leagueElo = leagueHistory.error
    ? null
    : new Map((leagueHistory.data ?? []).map((h) => [h.record_id as string, h]));
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
      const h = leagueElo?.get(r.id as string);
      const before = ((leagueElo ? h?.elo_before : r.elo_before) as number | null | undefined) ?? null;
      const after = ((leagueElo ? h?.elo_after : r.elo_after) as number | null | undefined) ?? null;
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

  for (const row of (schedules ?? []) as (ScheduleRow & { community_id?: string })[]) {
    const schedule = toSchedule(row);
    // Avisos gerais do mix só para quem joga na liga dele.
    const leagueId = row.community_id ?? null;
    const o = currentOccurrence(schedule, now, (d) => skipped.has(`${schedule.id}|${d}`));
    if (!o) continue;
    const key = `${schedule.id}:${o.date}`;
    const toOpen = o.opensAt.getTime() - now.getTime();
    const toStart = o.eventAt.getTime() - now.getTime();

    // Titulares entram na abertura; com o atraso da liga ligado, os outros recebem o
    // aviso perto do horário deles.
    const starters = await starterRule(leagueId);
    const delayMs = starters.delayMinutes * MIN;
    const toOpenOthers = toOpen + delayMs;
    if (delayMs > 0 && toOpenOthers > 0 && toOpenOthers <= 15 * MIN) {
      const others = new Date(o.opensAt.getTime() + delayMs);
      sent += await sendPush(
        { topic: "inscricoes", once: `abre-geral:${key}`, leagueId, exclude: [...starters.starters] },
        {
          title: `Inscrições abrem às ${hourMin(others)} ⏰`,
          body: `Mix de ${dayMonth(o.date)} às ${hourMin(o.eventAt)}. Os titulares já entraram; as vagas que sobraram vão por ordem de chegada.`,
          tag: `inscricoes:${o.date}`,
        },
      );
    }

    // Inscrições abrem em até 15 minutos.
    if (toOpen > 0 && toOpen <= 15 * MIN && (delayMs === 0 || starters.starters.size > 0)) {
      sent += await sendPush(
        {
          topic: "inscricoes",
          once: `abre:${key}`,
          leagueId,
          ...(delayMs > 0 ? { userIds: [...starters.starters] } : {}),
        },
        {
          title: `Inscrições abrem às ${hourMin(o.opensAt)} ⏰`,
          body: `Mix de ${dayMonth(o.date)} às ${hourMin(o.eventAt)}. Fique pronto: as vagas vão por ordem de chegada.`,
          tag: `inscricoes:${o.date}`,
        },
      );
    }

    // Lembretes de voto (só para quem ainda não votou): 1h depois de a lista fechar e 2h
    // antes do mix (este, se a lista fechou há pelo menos 30 min).
    if (toStart > 0) {
      const { data: all } = await admin
        .from("mix_registrations")
        .select("*")
        .match({ schedule_id: schedule.id, event_date: o.date })
        .order("created_at");
      const regs = queueOrder(all ?? []).slice(0, schedule.maxPlayers);
      const classified = regs.map((r) => r.user_id as string);
      // A lista fechou quando o último dos classificados entrou.
      const fullAt =
        classified.length >= schedule.maxPlayers
          ? new Date(Math.max(...regs.map((r) => new Date(r.created_at as string).getTime())))
          : null;
      if (fullAt) {
        const sinceFull = now.getTime() - fullAt.getTime();
        const slots = [
          { key: "lembrete-1h", due: sinceFull >= 60 * MIN },
          { key: "lembrete-2h", due: toStart <= 120 * MIN && sinceFull >= 30 * MIN },
        ].filter((x) => x.due);
        if (slots.length) {
          const draftStarted = !!(await draftOf(schedule.id, o.date));
          const pending = await pendingVoters(schedule.id, o.date, classified, draftStarted);
          for (const slot of slots)
            for (const p of pending)
              sent += await sendPush(
                { topic: "pick", userIds: [p.userId], once: `${slot.key}:${key}:${p.userId}` },
                { ...voteReminder(p, o.eventAt), tag: `votacao:${o.date}` },
              );
        }
      }
    }

    // Desempate de mapas aberto há 30 min ou mais: lembra quem ainda não votou.
    if (toStart > 0) {
      const { data: open } = await admin
        .from("map_tiebreaker_rounds")
        .select("id")
        .match({ schedule_id: schedule.id, event_date: o.date })
        .eq("status", "voting")
        .lt("started_at", new Date(now.getTime() - 30 * MIN).toISOString())
        .limit(1);
      if (open?.length) sent += await notifyTiebreaker(schedule.id, o.date, true);
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
        { topic: "inscricoes", exclude: registered, once: `vagas:${key}`, leagueId },
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
          leagueId,
        },
        {
          title: `Bolão fecha às ${hourMin(o.eventAt)} 🎲`,
          body: "Você ainda não palpitou. Quem vence (ou se empata), se é vitória seca ou com deslize, quem é o MVP e quem fica de lanterna?",
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

/** Troca no time tirado: os 2 capitães decidem se mantêm o time ou tiram de novo. */
export async function notifyDraftReview(
  scheduleId: string,
  date: string,
  captains: [string, string],
  changes: { out: string | null; in: string | null; side: "A" | "B" }[],
) {
  const ids = changes.flatMap((c) => [c.out, c.in]).filter((x): x is string => !!x);
  const names = await nameMap(ids);
  const text = changes
    .filter((c) => c.in)
    .map((c) =>
      c.out
        ? `${names.get(c.out) ?? "Um jogador"} saiu e ${names.get(c.in!) ?? "o reserva"} entrou`
        : `${names.get(c.in!) ?? "O reserva"} entrou`,
    )
    .join("; ");
  await sendPush(
    {
      topic: "pick",
      userIds: captains,
      once: `troca:${scheduleId}:${date}:${changes.map((c) => `${c.out}>${c.in}`).join(",")}`,
    },
    {
      title: "Troca no time 🔁",
      body: `${text}. Manter o time ou tirar novamente? Responda no MeuMix.`,
      tag: `pick:${date}`,
    },
  );
}

/** O PICK recomeçou (troca no time ou alguém já escolhido saiu): quem escolhe primeiro. */
export async function notifyRepick(scheduleId: string, date: string) {
  const draft = await draftOf(scheduleId, date);
  if (!draft || draft.status !== "draft") return;
  const first = draft.current_turn === "a" ? draft.captain_a : draft.captain_b;
  const names = await nameMap([first]);
  await sendPush(
    {
      topic: "pick",
      userIds: [draft.captain_a, draft.captain_b],
      once: `repick:${scheduleId}:${date}:${new Date().toISOString().slice(0, 16)}`,
    },
    {
      title: "Vamos tirar o time de novo 🔁",
      body: `Sem pedra, papel ou tesoura: ${names.get(first) ?? "quem venceu"} escolhe primeiro, como na primeira vez.`,
      tag: `pick:${date}`,
    },
  );
}

/**
 * Desempate de mapas aberto: avisa os classificados que ainda não votaram nele.
 * `reminder`: segundo aviso (cron), para quem continua sem votar.
 */
export async function notifyTiebreaker(scheduleId: string, date: string, reminder = false) {
  const admin = createSupabaseAdminClient();
  if (!admin) return 0;
  const { data: rounds } = await admin
    .from("map_tiebreaker_rounds")
    .select("*")
    .match({ schedule_id: scheduleId, event_date: date })
    .eq("status", "voting");
  let sent = 0;
  for (const r of rounds ?? []) {
    const [classified, { data: votes }, { data: maps }] = await Promise.all([
      classifiedOf(scheduleId, date),
      admin.from("map_tiebreaker_votes").select("user_id").eq("round_id", r.id),
      admin
        .from("maps")
        .select("id, name")
        .in("id", r.candidate_maps as string[]),
    ]);
    const voted = new Set((votes ?? []).map((v) => v.user_id as string));
    // Desempate entre os capitães: só os 2 recebem o aviso.
    const captains = r.mode === "captains" ? await draftOf(scheduleId, date) : null;
    if (r.mode === "captains" && !captains) continue;
    const voters = captains ? [captains.captain_a, captains.captain_b] : classified;
    const pending = voters.filter((u) => !voted.has(u));
    const names = (maps ?? []).map((m) => m.name as string).join(", ");
    const slots = r.slots as number;
    sent += await sendPush(
      { topic: "pick", userIds: pending, once: `desempate${reminder ? "-lembrete" : ""}:${r.id}` },
      {
        title: reminder
          ? "Falta o seu voto no desempate 🗺️"
          : captains
            ? "Desempate de mapas: só os capitães 👑🗺️"
            : `Desempate de mapas — round ${r.round_number} 🗺️`,
        body: captains
          ? `Escolha ${slots} mapa${slots > 1 ? "s" : ""} entre ${names}. Se os capitães discordarem, fica a escolha de quem perder o pedra-papel-tesoura.`
          : `Escolha ${slots} mapa${slots > 1 ? "s" : ""} entre ${names}. O mix só define os mapas com o voto de todos.`,
        tag: `desempate:${date}`,
      },
    );
  }
  return sent;
}
