-- MeuMix — punições, chaves de funcionalidades e desempate de mapas
-- Executar depois de 0005. Pode ser executado mais de uma vez.
-- Ver docs/regras-do-mix.md (seções 2, 3 e 10) e docs/especificacao-tecnica.md (4.2 e 4.5).

-- ---------------------------------------------------------------------------
-- Punições: atraso na abertura das inscrições. Escrita só pelo servidor (master).
-- expires_at nulo = permanente.
-- ---------------------------------------------------------------------------
create table if not exists public.user_penalties (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  delay_seconds int not null check (delay_seconds between 30 and 3600),
  reason text not null,
  expires_at timestamptz,
  is_active boolean not null default true,
  applied_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists user_penalties_active_idx on public.user_penalties (user_id) where is_active;
alter table public.user_penalties enable row level security;
-- Sem leitura pública: o servidor lê com a chave secreta e mostra só o necessário.
revoke all on public.user_penalties from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Chaves de funcionalidades (seção 10).
-- ---------------------------------------------------------------------------
create table if not exists public.feature_settings (
  feature_key text primary key,
  enabled boolean not null default false,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.feature_settings (feature_key, enabled) values
  ('map_tiebreaker', true), ('team_suggestion', false), ('background_music', false)
on conflict (feature_key) do nothing;
alter table public.feature_settings enable row level security;
drop policy if exists "leitura publica" on public.feature_settings;
create policy "leitura publica" on public.feature_settings for select using (true);
revoke insert, update, delete on public.feature_settings from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Desempate de mapas (rounds 1 e 2 + sorteio).
-- ---------------------------------------------------------------------------
create table if not exists public.map_tiebreaker_rounds (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.mix_schedules (id) on delete cascade,
  event_date date not null,
  round_number smallint not null check (round_number in (1, 2)),
  status text not null default 'voting' check (status in ('voting', 'completed', 'resolved_random')),
  candidate_maps text[] not null,
  slots int not null check (slots > 0),
  winning_maps text[] not null default '{}',
  random_maps text[] not null default '{}',
  started_at timestamptz not null default now(),
  closed_at timestamptz,
  unique (schedule_id, event_date, round_number)
);

create table if not exists public.map_tiebreaker_votes (
  round_id uuid not null references public.map_tiebreaker_rounds (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  maps text[] not null,
  created_at timestamptz not null default now(),
  primary key (round_id, user_id)
);

alter table public.map_tiebreaker_rounds enable row level security;
alter table public.map_tiebreaker_votes enable row level security;
drop policy if exists "leitura publica" on public.map_tiebreaker_rounds;
create policy "leitura publica" on public.map_tiebreaker_rounds for select using (true);
drop policy if exists "leitura publica" on public.map_tiebreaker_votes;
create policy "leitura publica" on public.map_tiebreaker_votes for select using (true);
revoke insert, update, delete on public.map_tiebreaker_rounds, public.map_tiebreaker_votes from anon, authenticated;

-- Tempo real.
do $$
declare t text;
begin
  foreach t in array array['feature_settings', 'map_tiebreaker_rounds', 'map_tiebreaker_votes'] loop
    if not exists (
      select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
