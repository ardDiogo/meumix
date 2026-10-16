-- MeuMix — níveis, ELO, partidas finalizadas e estatísticas reais
-- Executar depois de 0006. Pode ser executado mais de uma vez.
-- Ver docs/especificacao-tecnica.md (1.4, 3.6, 4.9, 4.13).

-- ---------------------------------------------------------------------------
-- Níveis (4.9). Teto do ELO: 1600.
-- ---------------------------------------------------------------------------
create table if not exists public.level_configs (
  level smallint primary key check (level between 1 and 10),
  elo_min int not null,
  elo_max int not null,
  color text not null
);
insert into public.level_configs (level, elo_min, elo_max, color) values
  (1, 0, 99, '#a1a1aa'), (2, 100, 219, '#22c55e'), (3, 220, 349, '#22c55e'),
  (4, 350, 499, '#eab308'), (5, 500, 659, '#eab308'), (6, 660, 829, '#eab308'),
  (7, 830, 1009, '#f97316'), (8, 1010, 1209, '#f97316'), (9, 1210, 1459, '#ef4444'),
  (10, 1460, 1600, '#ef4444')
on conflict (level) do nothing;
alter table public.level_configs enable row level security;
drop policy if exists "leitura publica" on public.level_configs;
create policy "leitura publica" on public.level_configs for select using (true);
revoke insert, update, delete on public.level_configs from anon, authenticated;

create or replace function public.level_for_elo(p_elo int)
returns smallint
language sql stable
set search_path = ''
as $$
  select coalesce(max(level), 1)::smallint from public.level_configs where elo_min <= greatest(p_elo, 0);
$$;

-- ELO inicial a partir do nível da Gamers Club (0–20).
create or replace function public.initial_elo_from_gc(p_gc int)
returns int
language plpgsql immutable
set search_path = ''
as $$
declare
  v_gc int := least(greatest(coalesce(p_gc, 0), 0), 20);
  v_elo int;
begin
  if v_gc <= 7 then
    v_elo := round(v_gc / 7.0 * 100);
  else
    v_elo := round(100 + (v_gc - 8) / 12.0 * (1210 - 100));
  end if;
  return least(v_elo, floor(1460 * 1.1)::int, 1600);
end;
$$;

-- ---------------------------------------------------------------------------
-- Perfil: ELO, nível e totais derivados (recalculados pelo trigger 3.6).
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists elo int not null default 0,
  add column if not exists level smallint not null default 1,
  add column if not exists gc_level smallint check (gc_level between 0 and 20),
  add column if not exists faceit_player_id text,
  add column if not exists total_kills int not null default 0,
  add column if not exists total_deaths int not null default 0,
  add column if not exists total_assists int not null default 0,
  add column if not exists total_first_kills int not null default 0,
  add column if not exists total_diff int not null default 0,
  add column if not exists total_wins int not null default 0,
  add column if not exists total_losses int not null default 0,
  add column if not exists mvp_count int not null default 0,
  add column if not exists lanterna_count int not null default 0,
  add column if not exists avg_adr numeric(6, 1),
  add column if not exists avg_kast numeric(5, 1),
  add column if not exists mixes_played int not null default 0,
  add column if not exists last_elo_change int;

-- Cadastro: cria o perfil com o ELO inicial do nível GC informado.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gc int := nullif(new.raw_user_meta_data ->> 'gc_level', '')::int;
  v_elo int := public.initial_elo_from_gc(v_gc);
begin
  insert into public.profiles (id, display_name, gc_level, elo, level)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1)),
    case when v_gc between 0 and 20 then v_gc end,
    v_elo,
    public.level_for_elo(v_elo)
  );
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Partidas finalizadas (mix_historico) e registros por jogador.
-- ---------------------------------------------------------------------------
create table if not exists public.mix_matches (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid references public.mix_schedules (id) on delete set null,
  event_date date not null,
  platform text not null check (platform in ('manual', 'gc', 'faceit')),
  -- [{ "map_id": "de_mirage", "score_a": 13, "score_b": 9 }, ...]
  maps jsonb not null default '[]',
  team_a_name text,
  team_b_name text,
  stats_calculated boolean not null default false,
  finalized_by uuid references public.profiles (id) on delete set null,
  finalized_at timestamptz not null default now(),
  unique (schedule_id, event_date)
);

create table if not exists public.player_match_records (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.mix_matches (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,
  player_name text not null,
  team char(1) not null check (team in ('A', 'B')),
  kills int not null default 0 check (kills >= 0),
  deaths int not null default 0 check (deaths >= 0),
  assists int not null default 0 check (assists >= 0),
  first_kills int not null default 0 check (first_kills >= 0),
  diff int not null default 0,
  adr numeric(6, 1),
  kast numeric(5, 1),
  rp int not null default 0,
  wins int not null default 0,
  losses int not null default 0,
  is_mvp boolean not null default false,
  is_lanterna boolean not null default false,
  calculate_elo boolean not null default true,
  elo_before int,
  elo_after int,
  level_before smallint,
  level_after smallint,
  created_at timestamptz not null default now(),
  unique (match_id, user_id)
);
create index if not exists player_match_records_user_idx on public.player_match_records (user_id);

create table if not exists public.elo_change_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  match_id uuid references public.mix_matches (id) on delete set null,
  old_elo int not null,
  new_elo int not null,
  old_level smallint not null,
  new_level smallint not null,
  reason text not null,
  changed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists elo_change_logs_user_idx on public.elo_change_logs (user_id, created_at);

alter table public.mix_matches enable row level security;
alter table public.player_match_records enable row level security;
alter table public.elo_change_logs enable row level security;
drop policy if exists "leitura publica" on public.mix_matches;
create policy "leitura publica" on public.mix_matches for select using (true);
drop policy if exists "leitura publica" on public.player_match_records;
create policy "leitura publica" on public.player_match_records for select using (true);
-- elo_change_logs: leitura pública por decisão do projeto (especificação, seção 2).
drop policy if exists "leitura publica" on public.elo_change_logs;
create policy "leitura publica" on public.elo_change_logs for select using (true);
revoke insert, update, delete on public.mix_matches, public.player_match_records, public.elo_change_logs
  from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3.6 Totais do perfil recalculados do zero a cada inclusão/edição/exclusão.
-- ---------------------------------------------------------------------------
create or replace function public.sync_profile_stats(p_user uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles p set
    total_kills = coalesce(s.kills, 0),
    total_deaths = coalesce(s.deaths, 0),
    total_assists = coalesce(s.assists, 0),
    total_first_kills = coalesce(s.first_kills, 0),
    total_diff = coalesce(s.diff, 0),
    total_wins = coalesce(s.wins, 0),
    total_losses = coalesce(s.losses, 0),
    mvp_count = coalesce(s.mvps, 0),
    lanterna_count = coalesce(s.lanternas, 0),
    avg_adr = s.avg_adr,
    avg_kast = s.avg_kast,
    mixes_played = coalesce(s.mixes, 0)
  from (
    select
      sum(kills) kills, sum(deaths) deaths, sum(assists) assists, sum(first_kills) first_kills,
      sum(diff) diff, sum(wins) wins, sum(losses) losses,
      count(*) filter (where is_mvp) mvps, count(*) filter (where is_lanterna) lanternas,
      round(avg(adr), 1) avg_adr, round(avg(kast), 1) avg_kast, count(distinct match_id) mixes
    from public.player_match_records where user_id = p_user
  ) s
  where p.id = p_user;
$$;

create or replace function public.player_match_records_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') and new.user_id is not null then
    perform public.sync_profile_stats(new.user_id);
  end if;
  if tg_op in ('UPDATE', 'DELETE') and old.user_id is not null
     and (tg_op = 'DELETE' or old.user_id is distinct from new.user_id) then
    perform public.sync_profile_stats(old.user_id);
  end if;
  return null;
end;
$$;

drop trigger if exists player_match_records_sync on public.player_match_records;
create trigger player_match_records_sync
  after insert or update or delete on public.player_match_records
  for each row execute function public.player_match_records_sync();

-- ---------------------------------------------------------------------------
-- 4.13 Finalização atômica: grava a partida, os registros e aplica o ELO.
-- p_players: [{ user_id, player_name, team, kills, deaths, assists, first_kills,
--               adr, kast, rp, is_mvp, is_lanterna, calculate_elo }]
-- ---------------------------------------------------------------------------
create or replace function public.finalize_mix(
  p_schedule uuid,
  p_date date,
  p_platform text,
  p_maps jsonb,
  p_players jsonb,
  p_by uuid,
  p_team_a text default null,
  p_team_b text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match uuid;
  v_wins_a int;
  v_wins_b int;
  v_player jsonb;
  v_user uuid;
  v_team text;
  v_old int;
  v_new int;
  v_rp int;
  v_calc boolean;
begin
  if jsonb_array_length(coalesce(p_maps, '[]')) = 0 then raise exception 'NO_MAPS'; end if;
  if jsonb_array_length(coalesce(p_players, '[]')) = 0 then raise exception 'NO_PLAYERS'; end if;

  insert into public.mix_matches (schedule_id, event_date, platform, maps, team_a_name, team_b_name, finalized_by, stats_calculated)
  values (p_schedule, p_date, p_platform, p_maps, p_team_a, p_team_b, p_by, true)
  returning id into v_match;

  select count(*) filter (where (m ->> 'score_a')::int > (m ->> 'score_b')::int),
         count(*) filter (where (m ->> 'score_b')::int > (m ->> 'score_a')::int)
  into v_wins_a, v_wins_b
  from jsonb_array_elements(p_maps) m;

  for v_player in select * from jsonb_array_elements(p_players) loop
    v_user := nullif(v_player ->> 'user_id', '')::uuid;
    v_team := v_player ->> 'team';
    v_rp := coalesce((v_player ->> 'rp')::int, 0);
    v_calc := coalesce((v_player ->> 'calculate_elo')::boolean, true) and v_user is not null;

    if v_user is not null then
      select elo into v_old from public.profiles where id = v_user for update;
    else
      v_old := null;
    end if;
    v_new := case when v_calc and v_old is not null then least(greatest(v_old + v_rp, 0), 1600) else v_old end;

    insert into public.player_match_records (
      match_id, user_id, player_name, team, kills, deaths, assists, first_kills, diff, adr, kast, rp,
      wins, losses, is_mvp, is_lanterna, calculate_elo, elo_before, elo_after, level_before, level_after
    ) values (
      v_match, v_user, v_player ->> 'player_name', v_team,
      coalesce((v_player ->> 'kills')::int, 0), coalesce((v_player ->> 'deaths')::int, 0),
      coalesce((v_player ->> 'assists')::int, 0), coalesce((v_player ->> 'first_kills')::int, 0),
      coalesce((v_player ->> 'kills')::int, 0) - coalesce((v_player ->> 'deaths')::int, 0),
      nullif(v_player ->> 'adr', '')::numeric, nullif(v_player ->> 'kast', '')::numeric, v_rp,
      case when v_team = 'A' then v_wins_a else v_wins_b end,
      case when v_team = 'A' then v_wins_b else v_wins_a end,
      coalesce((v_player ->> 'is_mvp')::boolean, false), coalesce((v_player ->> 'is_lanterna')::boolean, false),
      v_calc, v_old, v_new,
      case when v_old is not null then public.level_for_elo(v_old) end,
      case when v_new is not null then public.level_for_elo(v_new) end
    );

    if v_calc and v_old is not null then
      update public.profiles
      set elo = v_new, level = public.level_for_elo(v_new), last_elo_change = v_new - v_old
      where id = v_user;
      insert into public.elo_change_logs (user_id, match_id, old_elo, new_elo, old_level, new_level, reason, changed_by)
      values (v_user, v_match, v_old, v_new, public.level_for_elo(v_old), public.level_for_elo(v_new), 'mix', p_by);
    end if;
  end loop;

  return v_match;
end;
$$;

revoke execute on function public.finalize_mix(uuid, date, text, jsonb, jsonb, uuid, text, text) from public, anon, authenticated;
grant execute on function public.finalize_mix(uuid, date, text, jsonb, jsonb, uuid, text, text) to service_role;
