/**
 * Campeonatos do MeuMix: tipos, rótulos, validação do cadastro e regras de
 * permissão. Funções puras (testes: `npm run test:campeonato`).
 */

export type ChampionshipStatus = "setup" | "registration" | "teams" | "running" | "playoffs" | "finished" | "cancelled";
export type GroupFormat = "round_robin" | "double_round_robin";
export type PlayoffFormat = "none" | "final" | "semis_final" | "quarters_semis_final" | "round16_quarters_semis_final";

export interface Championship {
  id: string;
  slug: string;
  name: string;
  description: string;
  edition: string;
  hasBanner: boolean;
  startsOn: string | null;
  endsOn: string | null;
  teamCount: number;
  playersPerTeam: number;
  potCount: number;
  groupFormat: GroupFormat;
  groupBestOf: number;
  pointsWin: number;
  pointsLoss: number;
  playoffFormat: PlayoffFormat;
  playoffBestOf: number;
  /** Dias da semana permitidos (0 = domingo … 6 = sábado). */
  matchDays: number[];
  windowStart: string;
  windowEnd: string;
  servers: number;
  entryFee: number;
  /** Percentuais da premiação por colocação. */
  prizeSplit: number[];
  costs: number;
  status: ChampionshipStatus;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Campos editáveis no cadastro (o que vem do formulário). */
export type ChampionshipInput = Omit<
  Championship,
  "id" | "slug" | "hasBanner" | "createdBy" | "createdAt" | "updatedAt"
> & {
  /** Capa nova (JPEG em base64, sem prefixo), null para remover, undefined para manter. */
  banner?: string | null;
};

/** Limite de times por campeonato (o banco aceita o mesmo). */
export const MAX_TEAMS = 25;

export const STATUS_LABEL: Record<ChampionshipStatus, string> = {
  setup: "Em configuração",
  registration: "Aguardando inscrições",
  teams: "Em formação de equipes",
  running: "Em andamento",
  playoffs: "Playoffs",
  finished: "Finalizado",
  cancelled: "Cancelado",
};
export const STATUS_ORDER = Object.keys(STATUS_LABEL) as ChampionshipStatus[];

export const GROUP_FORMAT_LABEL: Record<GroupFormat, string> = {
  round_robin: "Todos contra todos (turno único)",
  double_round_robin: "Todos contra todos (ida e volta)",
};

export const PLAYOFF_FORMAT_LABEL: Record<PlayoffFormat, string> = {
  none: "Sem playoffs (vale a classificação)",
  final: "Final (1º × 2º)",
  semis_final: "Semifinais e final (4 times)",
  quarters_semis_final: "Quartas, semifinais e final (8 times)",
  round16_quarters_semis_final: "Oitavas, quartas, semifinais e final (16 times)",
};

/** Times que avançam para os playoffs em cada formato. */
export const PLAYOFF_TEAMS: Record<PlayoffFormat, number> = {
  none: 0,
  final: 2,
  semis_final: 4,
  quarters_semis_final: 8,
  round16_quarters_semis_final: 16,
};

export const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
export const WEEKDAYS_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/** Valores do primeiro campeonato (5 times, 4 potes, MD1 + playoffs MD3). */
export const DEFAULT_INPUT: ChampionshipInput = {
  name: "",
  description: "",
  edition: "1ª edição",
  startsOn: null,
  endsOn: null,
  teamCount: 5,
  playersPerTeam: 5,
  potCount: 4,
  groupFormat: "round_robin",
  groupBestOf: 1,
  pointsWin: 3,
  pointsLoss: 0,
  playoffFormat: "semis_final",
  playoffBestOf: 3,
  matchDays: [1, 2],
  windowStart: "21:00",
  windowEnd: "23:30",
  servers: 3,
  entryFee: 50,
  prizeSplit: [60, 25, 15],
  costs: 0,
  status: "setup",
};

/** Endereço amigável: "Copa MeuMix" + "1ª edição" → "copa-meumix-1a-edicao". */
export function championshipSlug(name: string, edition = "") {
  return (
    `${name} ${edition}`
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/ª/g, "a")
      .replace(/º/g, "o")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 72)
      .replace(/-+$/g, "") || "campeonato"
  );
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const int = (v: unknown, min: number, max: number) =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

/** Minutos desde 00:00 ("21:30" → 1290). */
export const minutesOf = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/**
 * Confere o cadastro. Devolve a lista de problemas (vazia = ok). A janela de
 * horário pode passar da meia-noite (ex.: 22:00 às 00:30).
 */
export function validateChampionship(i: ChampionshipInput): string[] {
  const e: string[] = [];
  if (i.name.trim().length < 2 || i.name.trim().length > 80) e.push("Nome: de 2 a 80 caracteres.");
  if (i.description.length > 2000) e.push("Descrição: até 2.000 caracteres.");
  if (i.edition.length > 40) e.push("Edição: até 40 caracteres.");
  if (i.startsOn && !DATE.test(i.startsOn)) e.push("Data de início inválida.");
  if (i.endsOn && !DATE.test(i.endsOn)) e.push("Data de encerramento inválida.");
  if (i.startsOn && i.endsOn && i.endsOn < i.startsOn) e.push("O encerramento não pode ser antes do início.");
  if (!int(i.teamCount, 2, MAX_TEAMS)) e.push(`Quantidade de equipes: de 2 a ${MAX_TEAMS}.`);
  if (!int(i.playersPerTeam, 2, 10)) e.push("Jogadores por equipe: de 2 a 10.");
  if (!int(i.potCount, 1, 10)) e.push("Potes: de 1 a 10.");
  // O capitão é um dos jogadores do time: os potes completam o resto.
  if (int(i.playersPerTeam, 2, 10) && int(i.potCount, 1, 10) && i.potCount !== i.playersPerTeam - 1)
    e.push(
      `Com ${i.playersPerTeam} jogadores por equipe (capitão + ${i.playersPerTeam - 1}), são ${i.playersPerTeam - 1} potes.`,
    );
  if (!(i.groupFormat in GROUP_FORMAT_LABEL)) e.push("Formato da fase classificatória inválido.");
  if (![1, 3].includes(i.groupBestOf)) e.push("Partidas da classificatória: MD1 ou MD3.");
  if (!int(i.pointsWin, 0, 10) || !int(i.pointsLoss, 0, 10)) e.push("Pontos por vitória/derrota: de 0 a 10.");
  if (!(i.playoffFormat in PLAYOFF_FORMAT_LABEL)) e.push("Formato dos playoffs inválido.");
  else if (PLAYOFF_TEAMS[i.playoffFormat] > i.teamCount)
    e.push(`O formato dos playoffs precisa de ${PLAYOFF_TEAMS[i.playoffFormat]} equipes.`);
  if (![1, 3, 5].includes(i.playoffBestOf)) e.push("Partidas dos playoffs: MD1, MD3 ou MD5.");
  if (!i.matchDays.length || i.matchDays.some((d) => !int(d, 0, 6))) e.push("Escolha ao menos um dia para os jogos.");
  if (!TIME.test(i.windowStart) || !TIME.test(i.windowEnd)) e.push("Horário inválido (use HH:MM).");
  else if (i.windowStart === i.windowEnd) e.push("O horário de início e de fim não podem ser iguais.");
  if (!int(i.servers, 1, 10)) e.push("Servidores simultâneos: de 1 a 10.");
  if (!(i.entryFee >= 0 && i.entryFee <= 100000)) e.push("Valor da inscrição inválido.");
  if (!(i.costs >= 0 && i.costs <= 1000000)) e.push("Custos inválidos.");
  if (!i.prizeSplit.length || i.prizeSplit.length > 8 || i.prizeSplit.some((p) => !(p > 0 && p <= 100)))
    e.push("Premiação: de 1 a 8 colocações, cada uma com mais de 0%.");
  else if (Math.abs(i.prizeSplit.reduce((s, p) => s + p, 0) - 100) > 0.01)
    e.push("Os percentuais da premiação precisam somar 100%.");
  if (!STATUS_ORDER.includes(i.status)) e.push("Status inválido.");
  return e;
}

/** Quem pode ver o botão "Novo campeonato": os administradores. */
export const canCreateChampionship = (user: { role: string; isSuperAdmin: boolean } | null) =>
  !!user && (user.isSuperAdmin || user.role === "admin");

/**
 * Quem organiza um campeonato: quem criou, os organizadores liberados pelo
 * super admin e o próprio super admin.
 */
export function canManageChampionship(
  user: { id: string; isSuperAdmin: boolean } | null,
  championship: { createdBy: string | null },
  organizers: string[],
) {
  if (!user) return false;
  return user.isSuperAdmin || championship.createdBy === user.id || organizers.includes(user.id);
}

/**
 * Premiação: arrecadação (inscrições × valor) menos os custos, dividida pelos
 * percentuais. Centavos arredondados para baixo; a sobra fica com o 1º lugar.
 */
export function prizeDistribution(entryFee: number, players: number, split: number[], costs = 0) {
  const collected = Math.round(entryFee * players * 100);
  const pool = Math.max(0, collected - Math.round(costs * 100));
  const parts = split.map((p) => Math.floor((pool * p) / 100));
  if (parts.length) parts[0]! += pool - parts.reduce((s, c) => s + c, 0);
  return { collected: collected / 100, pool: pool / 100, prizes: parts.map((c) => c / 100) };
}

export const formatMoney = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const MIGRATION = "Rode a migração 0038_championships.sql no Supabase.";
/** Tabela ou coluna inexistente (migração não rodada). */
export const missing = (code?: string) => code === "42P01" || code === "PGRST205" || code === "42703";

/* --------------------------- Inscritos e times --------------------------- */

export interface ChampionshipTeam {
  id: string;
  name: string;
  tag: string;
  color: string;
  hasLogo: boolean;
  captainId: string | null;
  draftOrder: number | null;
}

export interface ChampionshipPlayer {
  userId: string;
  pot: number | null;
  teamId: string | null;
}

export interface TeamInput {
  name: string;
  tag: string;
  color: string;
  captainId: string | null;
  /** Escudo novo (JPEG base64), null para remover, undefined para manter. */
  logo?: string | null;
}

/** Cores sugeridas para os times (contraste bom no tema escuro). */
export const TEAM_COLORS = ["#FF6A00", "#3B82F6", "#22C55E", "#EAB308", "#A855F7", "#EF4444", "#06B6D4", "#EC4899"];

export function validateTeam(t: TeamInput): string[] {
  const e: string[] = [];
  if (!t.name.trim() || t.name.trim().length > 40) e.push("Nome do time: de 1 a 40 caracteres.");
  if (t.tag.trim().length > 5) e.push("Sigla: até 5 caracteres.");
  if (!/^#[0-9A-Fa-f]{6}$/.test(t.color)) e.push("Cor inválida.");
  return e;
}

/** Sigla sugerida a partir do nome: "Time Snkk" → "SNKK". */
export const suggestTag = (name: string) =>
  name
    .replace(/^time\s+/i, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 4)
    .toUpperCase();

/**
 * O que falta para o draft: inscritos (equipes × jogadores), times e um
 * capitão por time. Vazio = pronto para montar os potes.
 */
export function rosterIssues(
  c: { teamCount: number; playersPerTeam: number },
  teams: ChampionshipTeam[],
  players: ChampionshipPlayer[],
) {
  const issues: string[] = [];
  const needed = c.teamCount * c.playersPerTeam;
  const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
  const lack = needed - players.length;
  if (lack > 0)
    issues.push(`${plural(lack, "Falta 1 inscrito", `Faltam ${lack} inscritos`)} (${players.length} de ${needed}).`);
  if (lack < 0)
    issues.push(
      `${plural(-lack, "Há 1 inscrito a mais", `Há ${-lack} inscritos a mais`)} (${players.length} para ${needed} vagas).`,
    );
  const lackTeams = c.teamCount - teams.length;
  if (lackTeams > 0)
    issues.push(
      `${plural(lackTeams, "Falta 1 time", `Faltam ${lackTeams} times`)} (${teams.length} de ${c.teamCount}).`,
    );
  if (lackTeams < 0) issues.push(plural(-lackTeams, "Há 1 time a mais.", `Há ${-lackTeams} times a mais.`));
  const noCaptain = teams.filter((t) => !t.captainId);
  if (noCaptain.length)
    issues.push(
      `${noCaptain.length === 1 ? "Time sem capitão" : "Times sem capitão"}: ${noCaptain.map((t) => t.name).join(", ")}.`,
    );
  return issues;
}
