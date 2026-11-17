import "server-only";
import { isSuperAdminEmail, type PlatformRole } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { eloInLeague, getCurrentLeague } from "./league";

export interface ManagedUser {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
  emailConfirmed: boolean;
  role: PlatformRole;
  isSuperAdmin: boolean;
  fullName: string | null;
  elo: number;
  gcLevel: number | null;
  mixesPlayed: number;
  avatarUrl: string | null;
  steamUrl: string | null;
  twitchLogin: string | null;
  /** Avisos no celular: aparelhos ativos, tipos e o último aviso entregue (null sem a migração 0031). */
  push: PushStatus | null;
}

export interface PushStatus {
  devices: number;
  /** "iPhone", "Android", "Windows"… (pela identificação do navegador). */
  kinds: string[];
  /** Aviso de votação (lista fechada, lembretes, capitães e PICK) ligado em algum aparelho. */
  voting: boolean;
  lastSentAt: string | null;
}

/** Tipo do aparelho pela identificação do navegador (iPad às vezes aparece como Mac). */
function deviceKind(ua: string | null) {
  const u = (ua ?? "").toLowerCase();
  if (/iphone|ipad/.test(u)) return "iPhone";
  if (u.includes("android")) return "Android";
  if (u.includes("windows")) return "Windows";
  if (u.includes("mac")) return "Mac";
  if (u.includes("linux")) return "Linux";
  return "Outro";
}

export type ListUsersResult =
  { status: "ok"; users: ManagedUser[] } | { status: "not_configured" } | { status: "error"; message: string };

/** Lista contas para o super admin. Requer `SUPABASE_SERVICE_ROLE_KEY`. Chame só após checar a permissão. */
export async function listManagedUsers(): Promise<ListUsersResult> {
  const admin = createSupabaseAdminClient();
  if (!admin) return { status: "not_configured" };

  const [{ data, error }, profiles, steam, twitch, subs] = await Promise.all([
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    admin.from("profiles").select("id, display_name, role, full_name, elo, gc_level, mixes_played"),
    // Separado: sem a migração 0009 a lista continua funcionando, só sem fotos.
    admin.from("profiles").select("id, avatar_url, steam_url"),
    // Idem para a migração 0022 (canal da Twitch).
    admin.from("profiles").select("id, twitch_login"),
    // Avisos no celular (sem a migração 0031: sem a informação).
    admin.from("push_subscriptions").select("user_id, topics, user_agent, last_sent_at"),
  ]);
  if (error) return { status: "error", message: "Não foi possível carregar os usuários." };
  // ELO na liga do topo (sem ligas: o de profiles).
  const league = await getCurrentLeague();
  const leagueElo = league
    ? await eloInLeague(
        admin,
        league.id,
        data.users.map((u) => u.id),
      )
    : null;

  const byId = new Map((profiles.data ?? []).map((p) => [p.id as string, p]));
  const steamById = new Map((steam.error ? [] : (steam.data ?? [])).map((p) => [p.id as string, p]));
  const twitchById = new Map(
    (twitch.error ? [] : (twitch.data ?? [])).map((p) => [p.id as string, (p.twitch_login as string | null) ?? null]),
  );
  const pushOf = new Map<string, PushStatus>();
  for (const s of subs.error ? [] : (subs.data ?? [])) {
    const id = s.user_id as string;
    const p = pushOf.get(id) ?? { devices: 0, kinds: [], voting: false, lastSentAt: null };
    p.devices += 1;
    const kind = deviceKind(s.user_agent as string | null);
    if (!p.kinds.includes(kind)) p.kinds.push(kind);
    if (((s.topics as string[] | null) ?? []).includes("pick")) p.voting = true;
    const last = (s.last_sent_at as string | null) ?? null;
    if (last && (!p.lastSentAt || last > p.lastSentAt)) p.lastSentAt = last;
    pushOf.set(id, p);
  }
  const users = data.users.map((u): ManagedUser => {
    const profile = byId.get(u.id);
    const email = u.email ?? "";
    return {
      id: u.id,
      email,
      displayName:
        profile?.display_name ?? (u.user_metadata?.display_name as string | undefined) ?? email.split("@")[0]!,
      createdAt: u.created_at,
      emailConfirmed: !!u.email_confirmed_at,
      role: profile?.role === "admin" ? "admin" : "user",
      isSuperAdmin: isSuperAdminEmail(email, !!u.email_confirmed_at),
      fullName: (profile?.full_name as string | null) ?? null,
      elo: leagueElo?.get(u.id)?.elo ?? (profile?.elo as number | undefined) ?? 0,
      gcLevel: (profile?.gc_level as number | null | undefined) ?? null,
      mixesPlayed: (profile?.mixes_played as number | undefined) ?? 0,
      avatarUrl: (steamById.get(u.id)?.avatar_url as string | null | undefined) ?? null,
      steamUrl: (steamById.get(u.id)?.steam_url as string | null | undefined) ?? null,
      twitchLogin: twitchById.get(u.id) ?? null,
      push: subs.error ? null : (pushOf.get(u.id) ?? { devices: 0, kinds: [], voting: false, lastSentAt: null }),
    };
  });
  users.sort(
    (a, b) =>
      Number(b.isSuperAdmin) - Number(a.isSuperAdmin) ||
      (a.role === b.role ? a.email.localeCompare(b.email) : a.role === "admin" ? -1 : 1),
  );
  return { status: "ok", users };
}
