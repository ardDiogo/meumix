-- MeuMix — Fase 2: capitães, pedra-papel-tesoura e escolha dos times (1-2-2-2-1)
-- Executar depois de 0004 (exige a tabela captain_votes). Pode ser executado mais de uma vez. Ver docs/especificacao-tecnica.md (3.4, 4.6, 4.7, 4.8).
-- Toda decisão acontece aqui no banco, com a linha travada (SELECT … FOR UPDATE).

do $$
begin
  if to_regclass('public.captain_votes') is null then
    raise exception 'Rode primeiro a migração 0004_votes_audit_realtime.sql (tabela captain_votes não existe).';
  end if;
end $$;

create table if not exists public.mix_draft_state (
  schedule_id uuid not null references public.mix_schedules (id) on delete cascade,
  event_date date not null,
  status text not null default 'ppt' check (status in ('ppt', 'draft', 'completed')),
  captain_a uuid not null references public.profiles (id) on delete cascade,
  captain_b uuid not null references public.profiles (id) on delete cascade,
  a_ready boolean not null default false,
  b_ready boolean not null default false,
  -- Jogadas reveladas somente após o resultado.
  revealed_a text check (revealed_a in ('rock', 'paper', 'scissors')),
  revealed_b text check (revealed_b in ('rock', 'paper', 'scissors')),
  last_tie_choice text check (last_tie_choice in ('rock', 'paper', 'scissors')),
  tie_count int not null default 0,
  winner uuid references public.profiles (id) on delete set null,
  current_turn text check (current_turn in ('a', 'b')),
  turn_number int not null default 0,
  picks_in_turn int not null default 0,
  -- A ordem dos arrays é a ordem de escolha (o capitão é o 1º).
  team_a uuid[] not null default '{}',
  team_b uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (schedule_id, event_date),
  check (captain_a <> captain_b)
);

-- Jogadas do PPT: SEM leitura pública (ninguém espia a jogada do outro).
create table if not exists public.mix_draft_ppt_choices (
  schedule_id uuid not null,
  event_date date not null,
  captain_id uuid not null references public.profiles (id) on delete cascade,
  choice text not null check (choice in ('rock', 'paper', 'scissors')),
  primary key (schedule_id, event_date, captain_id),
  foreign key (schedule_id, event_date) references public.mix_draft_state (schedule_id, event_date) on delete cascade
);

alter table public.mix_draft_state enable row level security;
alter table public.mix_draft_ppt_choices enable row level security;
drop policy if exists "leitura publica" on public.mix_draft_state;
create policy "leitura publica" on public.mix_draft_state for select using (true);
revoke insert, update, delete on public.mix_draft_state from anon, authenticated;
revoke all on public.mix_draft_ppt_choices from anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'mix_draft_state'
  ) then
    alter publication supabase_realtime add table public.mix_draft_state;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Classificados de uma ocorrência (os N primeiros por ordem de chegada).
-- ---------------------------------------------------------------------------
create or replace function public.mix_classified(p_schedule uuid, p_date date)
returns uuid[]
language sql stable
set search_path = ''
as $$
  select coalesce(array_agg(user_id order by created_at, id), '{}')
  from (
    select r.user_id, r.created_at, r.id
    from public.mix_registrations r
    where r.schedule_id = p_schedule and r.event_date = p_date
    order by r.created_at, r.id
    limit (select s.max_players from public.mix_schedules s where s.id = p_schedule)
  ) c;
$$;

-- ---------------------------------------------------------------------------
-- 3.4 Bloqueio de voto tardio: com a disputa iniciada, votos de capitão são recusados.
-- ---------------------------------------------------------------------------
create or replace function public.block_late_captain_vote()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.mix_draft_state d
    where d.schedule_id = new.schedule_id and d.event_date = new.event_date
  ) then
    raise exception 'DRAFT_STARTED';
  end if;
  return new;
end;
$$;

drop trigger if exists captain_votes_block_late on public.captain_votes;
create trigger captain_votes_block_late
  before insert on public.captain_votes
  for each row execute function public.block_late_captain_vote();

-- ---------------------------------------------------------------------------
-- 4.6 Início: os 2 mais votados viram capitães (desempate pela ordem de inscrição).
-- Idempotente: se já existe, devolve o estado atual.
-- ---------------------------------------------------------------------------
create or replace function public.draft_start(p_schedule uuid, p_date date)
returns public.mix_draft_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state public.mix_draft_state;
  v_classified uuid[];
  v_max int;
  v_captains uuid[];
begin
  select * into v_state from public.mix_draft_state where schedule_id = p_schedule and event_date = p_date;
  if found then return v_state; end if;

  select max_players into v_max from public.mix_schedules where id = p_schedule;
  v_classified := public.mix_classified(p_schedule, p_date);
  if coalesce(array_length(v_classified, 1), 0) < v_max then
    raise exception 'NOT_ENOUGH_PLAYERS';
  end if;

  select array_agg(c.player order by c.votes desc, c.pos) into v_captains
  from (
    select p.player, p.pos,
      (select count(*) from public.captain_votes v
        where v.schedule_id = p_schedule and v.event_date = p_date
          and v.candidate_id = p.player and v.voter_id = any (v_classified)) as votes
    from unnest(v_classified) with ordinality as p(player, pos)
  ) c;

  insert into public.mix_draft_state (schedule_id, event_date, captain_a, captain_b)
  values (p_schedule, p_date, v_captains[1], v_captains[2])
  on conflict (schedule_id, event_date) do nothing;

  select * into v_state from public.mix_draft_state where schedule_id = p_schedule and event_date = p_date;
  return v_state;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4.7 Pedra-papel-tesoura decidido no banco.
-- Retorna: waiting | tie | win
-- ---------------------------------------------------------------------------
create or replace function public.draft_ppt_submit(p_schedule uuid, p_date date, p_user uuid, p_choice text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.mix_draft_state;
  v_side text;
  v_other uuid;
  v_other_choice text;
  v_a text;
  v_b text;
  v_winner_side text;
begin
  if p_choice not in ('rock', 'paper', 'scissors') then raise exception 'INVALID_CHOICE'; end if;

  select * into s from public.mix_draft_state
  where schedule_id = p_schedule and event_date = p_date
  for update;
  if not found then raise exception 'DRAFT_NOT_STARTED'; end if;
  if s.status <> 'ppt' then raise exception 'PPT_FINISHED'; end if;

  if p_user = s.captain_a then v_side := 'a'; v_other := s.captain_b;
  elsif p_user = s.captain_b then v_side := 'b'; v_other := s.captain_a;
  else raise exception 'NOT_CAPTAIN';
  end if;
  if (v_side = 'a' and s.a_ready) or (v_side = 'b' and s.b_ready) then raise exception 'ALREADY_READY'; end if;

  insert into public.mix_draft_ppt_choices (schedule_id, event_date, captain_id, choice)
  values (p_schedule, p_date, p_user, p_choice)
  on conflict (schedule_id, event_date, captain_id) do update set choice = excluded.choice;

  select choice into v_other_choice from public.mix_draft_ppt_choices
  where schedule_id = p_schedule and event_date = p_date and captain_id = v_other;

  if v_other_choice is null then
    update public.mix_draft_state
    set a_ready = a_ready or v_side = 'a', b_ready = b_ready or v_side = 'b', updated_at = now()
    where schedule_id = p_schedule and event_date = p_date;
    return 'waiting';
  end if;

  delete from public.mix_draft_ppt_choices where schedule_id = p_schedule and event_date = p_date;

  if v_other_choice = p_choice then
    update public.mix_draft_state
    set a_ready = false, b_ready = false, last_tie_choice = p_choice, tie_count = tie_count + 1,
        revealed_a = p_choice, revealed_b = p_choice, updated_at = now()
    where schedule_id = p_schedule and event_date = p_date;
    return 'tie';
  end if;

  v_a := case when v_side = 'a' then p_choice else v_other_choice end;
  v_b := case when v_side = 'b' then p_choice else v_other_choice end;
  v_winner_side := case
    when (v_a, v_b) in (('rock', 'scissors'), ('scissors', 'paper'), ('paper', 'rock')) then 'a'
    else 'b'
  end;

  update public.mix_draft_state
  set status = 'draft',
      a_ready = true, b_ready = true,
      revealed_a = v_a, revealed_b = v_b,
      winner = case when v_winner_side = 'a' then captain_a else captain_b end,
      current_turn = v_winner_side,
      turn_number = 0, picks_in_turn = 0,
      team_a = array[captain_a], team_b = array[captain_b],
      updated_at = now()
  where schedule_id = p_schedule and event_date = p_date;
  return 'win';
end;
$$;

-- ---------------------------------------------------------------------------
-- 4.8 Escolha 1-2-2-2-1 com leitura fresca e travada.
-- ---------------------------------------------------------------------------
create or replace function public.draft_pick(p_schedule uuid, p_date date, p_user uuid, p_player uuid)
returns public.mix_draft_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.mix_draft_state;
  v_pattern int[] := array[1, 2, 2, 2, 1];
  v_side text;
  v_picks int;
  v_turn int;
  v_next text;
begin
  select * into s from public.mix_draft_state
  where schedule_id = p_schedule and event_date = p_date
  for update;
  if not found then raise exception 'DRAFT_NOT_STARTED'; end if;
  if s.status <> 'draft' then raise exception 'NOT_PICKING'; end if;

  if p_user = s.captain_a then v_side := 'a';
  elsif p_user = s.captain_b then v_side := 'b';
  else raise exception 'NOT_CAPTAIN';
  end if;
  if v_side <> s.current_turn then raise exception 'NOT_YOUR_TURN'; end if;
  if p_player = any (s.team_a) or p_player = any (s.team_b) then raise exception 'PLAYER_TAKEN'; end if;
  if not (p_player = any (public.mix_classified(p_schedule, p_date))) then raise exception 'NOT_CLASSIFIED'; end if;

  v_picks := s.picks_in_turn + 1;
  v_turn := s.turn_number;
  v_next := s.current_turn;
  if v_picks >= v_pattern[v_turn + 1] then
    v_turn := v_turn + 1;
    v_picks := 0;
    v_next := case when s.current_turn = 'a' then 'b' else 'a' end;
  end if;

  update public.mix_draft_state
  set team_a = case when v_side = 'a' then team_a || p_player else team_a end,
      team_b = case when v_side = 'b' then team_b || p_player else team_b end,
      picks_in_turn = v_picks,
      turn_number = v_turn,
      current_turn = case when v_turn >= array_length(v_pattern, 1) then null else v_next end,
      status = case when v_turn >= array_length(v_pattern, 1) then 'completed' else 'draft' end,
      updated_at = now()
  where schedule_id = p_schedule and event_date = p_date
  returning * into s;
  return s;
end;
$$;

-- Só o servidor (chave secreta) executa as funções do draft.
revoke execute on function public.draft_start(uuid, date), public.draft_ppt_submit(uuid, date, uuid, text),
  public.draft_pick(uuid, date, uuid, uuid) from public, anon, authenticated;
grant execute on function public.draft_start(uuid, date), public.draft_ppt_submit(uuid, date, uuid, text),
  public.draft_pick(uuid, date, uuid, uuid) to service_role;
