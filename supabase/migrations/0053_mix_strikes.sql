-- MeuMix — Faltas e suspensão automática
-- Executar depois de 0052. Pode ser executado mais de uma vez.
--
-- • Sair do mix sendo um dos classificados faltando menos de 3h = 1 falta.
-- • Não comparecer (o admin remove com "Faltou") = 2 faltas.
-- • 2 faltas na mesma liga = suspenso nos 2 próximos mixes dessa liga: pode se
--   inscrever, mas só como reserva (fica atrás de todos os não suspensos).
-- • Cada falta vale 60 dias; as que geraram uma suspensão não contam de novo.
-- • A regra vale a partir de agora: saídas antigas não viram falta.

create table if not exists public.mix_suspensions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  league_id uuid not null references public.communities (id) on delete cascade,
  -- Data do mix que gerou a suspensão: contam os mixes da liga depois dela.
  from_date date not null,
  mixes smallint not null default 2 check (mixes > 0),
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  ended_by uuid references public.profiles (id) on delete set null
);
create index if not exists mix_suspensions_user_idx on public.mix_suspensions (user_id, league_id) where ended_at is null;

create table if not exists public.mix_strikes (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  league_id uuid not null references public.communities (id) on delete cascade,
  schedule_id uuid references public.mix_schedules (id) on delete set null,
  event_date date not null,
  kind text not null check (kind in ('late_leave', 'no_show')),
  points smallint not null check (points between 1 and 2),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '60 days',
  created_by uuid references public.profiles (id) on delete set null,
  pardoned_at timestamptz,
  pardoned_by uuid references public.profiles (id) on delete set null,
  suspension_id bigint references public.mix_suspensions (id) on delete set null,
  unique (user_id, schedule_id, event_date)
);
create index if not exists mix_strikes_user_idx on public.mix_strikes (user_id, league_id);

-- Só o servidor lê e grava.
alter table public.mix_strikes enable row level security;
alter table public.mix_suspensions enable row level security;
revoke all on public.mix_strikes, public.mix_suspensions from anon, authenticated;

-- Inscrição de suspenso: só como reserva (a ordem da lista põe essas por último).
alter table public.mix_registrations add column if not exists reserve_only boolean not null default false;

-- ---------------------------------------------------------------------------
-- Suspensões em andamento (com quantos mixes da liga já passaram)
-- ---------------------------------------------------------------------------
create or replace function public.active_suspensions(p_users uuid[] default null)
returns table (id bigint, user_id uuid, league_id uuid, from_date date, mixes smallint, served int, created_at timestamptz)
language sql stable
security definer
set search_path = ''
as $$
  select * from (
    select s.id, s.user_id, s.league_id, s.from_date, s.mixes,
      (select count(distinct (m.schedule_id, m.event_date))::int
         from public.mix_matches m
        where m.league_id = s.league_id and m.event_date > s.from_date) served,
      s.created_at
    from public.mix_suspensions s
    where s.ended_at is null and (p_users is null or s.user_id = any (p_users))
  ) x
  where x.served < x.mixes;
$$;

revoke all on function public.active_suspensions(uuid[]) from public, anon, authenticated;
grant execute on function public.active_suspensions(uuid[]) to service_role;

create or replace function public.is_suspended(p_user uuid, p_league uuid)
returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.active_suspensions(array[p_user]) s where s.league_id = p_league);
$$;

revoke all on function public.is_suspended(uuid, uuid) from public, anon, authenticated;

-- Toda inscrição (do jogador ou incluída pelo admin) de um suspenso entra como reserva.
create or replace function public.mix_registrations_reserve_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.reserve_only := public.is_suspended(new.user_id, public.league_of_schedule(new.schedule_id));
  return new;
end;
$$;

drop trigger if exists mix_registrations_reserve_only on public.mix_registrations;
create trigger mix_registrations_reserve_only
  before insert on public.mix_registrations
  for each row execute function public.mix_registrations_reserve_only();

-- Classificados: os N primeiros, com os suspensos depois de todos os outros.
create or replace function public.mix_classified(p_schedule uuid, p_date date)
returns uuid[]
language sql stable
set search_path = ''
as $$
  select coalesce(array_agg(user_id order by reserve_only, created_at, id), '{}')
  from (
    select r.user_id, r.reserve_only, r.created_at, r.id
    from public.mix_registrations r
    where r.schedule_id = p_schedule and r.event_date = p_date
    order by r.reserve_only, r.created_at, r.id
    limit (select s.max_players from public.mix_schedules s where s.id = p_schedule)
  ) c;
$$;

-- ---------------------------------------------------------------------------
-- Registra uma falta; com 2 pontos ativos na liga, suspende nos 2 próximos mixes
-- ---------------------------------------------------------------------------
create or replace function public.mix_add_strike(
  p_user uuid,
  p_schedule uuid,
  p_date date,
  p_kind text,
  p_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_league uuid := public.league_of_schedule(p_schedule);
  v_points smallint := case p_kind when 'no_show' then 2 else 1 end;
  v_total int;
  v_susp bigint;
begin
  perform pg_advisory_xact_lock(hashtext('meumix.strike:' || p_user::text));

  -- Uma falta por mix: "não compareceu" substitui uma saída tardia do mesmo mix.
  insert into public.mix_strikes (user_id, league_id, schedule_id, event_date, kind, points, created_by)
  values (p_user, v_league, p_schedule, p_date, p_kind, v_points, p_by)
  on conflict (user_id, schedule_id, event_date) do update
    set kind = excluded.kind, points = excluded.points, created_by = excluded.created_by
    where public.mix_strikes.points < excluded.points and public.mix_strikes.suspension_id is null
      and public.mix_strikes.pardoned_at is null;

  select coalesce(sum(points), 0) into v_total
  from public.mix_strikes
  where user_id = p_user and league_id = v_league and suspension_id is null
    and pardoned_at is null and expires_at > now();

  if v_total >= 2 and not public.is_suspended(p_user, v_league) then
    insert into public.mix_suspensions (user_id, league_id, from_date)
    values (p_user, v_league, p_date)
    returning id into v_susp;
    update public.mix_strikes set suspension_id = v_susp
    where user_id = p_user and league_id = v_league and suspension_id is null
      and pardoned_at is null and expires_at > now();
    -- Já inscrito em outro mix da liga: passa para reserva.
    update public.mix_registrations r set reserve_only = true
    where r.user_id = p_user and r.event_date > p_date
      and public.league_of_schedule(r.schedule_id) = v_league
      and not exists (select 1 from public.mix_matches m where m.schedule_id = r.schedule_id and m.event_date = r.event_date);
    return jsonb_build_object('points', v_total, 'suspended', true, 'league_id', v_league);
  end if;

  return jsonb_build_object('points', v_total, 'suspended', false, 'league_id', v_league);
end;
$$;

revoke all on function public.mix_add_strike(uuid, uuid, date, text, uuid) from public, anon, authenticated;
grant execute on function public.mix_add_strike(uuid, uuid, date, text, uuid) to service_role;
