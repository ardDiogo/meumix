-- MeuMix — schema inicial (PostgreSQL / Supabase)
-- Espelha src/types/domain.ts. Ainda NÃO aplicado em nenhum projeto.
-- Aplicar com: supabase db push  (ou colar no SQL Editor do Supabase)

create extension if not exists "pgcrypto";

-- Perfis de usuário (1:1 com auth.users)
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);

-- Jogadores (podem existir sem conta vinculada)
create table public.players (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references public.profiles (id) on delete set null,
  nickname text not null,
  real_name text,
  avatar_url text,
  steam_id text unique check (steam_id ~ '^7656119\d{10}$'),
  country char(2),
  created_at timestamptz not null default now()
);

-- Comunidades (cada uma com seus mixes e rankings)
create table public.communities (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  starting_elo integer not null default 1000,
  created_at timestamptz not null default now()
);

create type public.community_role as enum ('owner', 'admin', 'organizer', 'player');

-- Um jogador participa de várias comunidades, com ELO próprio em cada uma
create table public.community_members (
  community_id uuid not null references public.communities (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  role public.community_role not null default 'player',
  elo integer not null,
  joined_at timestamptz not null default now(),
  primary key (community_id, player_id)
);

create table public.maps (
  id text primary key,            -- ex.: de_mirage
  name text not null,
  active boolean not null default true
);

create type public.mix_status as enum ('scheduled', 'live', 'finished', 'cancelled');

create table public.mixes (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities (id) on delete cascade,
  name text not null,
  scheduled_at timestamptz not null,
  status public.mix_status not null default 'scheduled',
  mvp_player_id uuid references public.players (id) on delete set null,
  twitch_url text check (twitch_url is null or twitch_url ~* '^https://(www\.)?twitch\.tv/'),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.mixes (community_id, scheduled_at desc);

create table public.mix_organizers (
  mix_id uuid not null references public.mixes (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  primary key (mix_id, player_id)
);

create table public.mix_teams (
  mix_id uuid not null references public.mixes (id) on delete cascade,
  side char(1) not null check (side in ('A', 'B')),
  name text not null,
  captain_id uuid references public.players (id) on delete set null,
  primary key (mix_id, side)
);

create table public.mix_team_players (
  mix_id uuid not null,
  side char(1) not null,
  player_id uuid not null references public.players (id) on delete cascade,
  primary key (mix_id, player_id),
  foreign key (mix_id, side) references public.mix_teams (mix_id, side) on delete cascade
);

create table public.mix_maps (
  mix_id uuid not null references public.mixes (id) on delete cascade,
  map_order smallint not null,
  map_id text not null references public.maps (id),
  score_a smallint,
  score_b smallint,
  winner char(1) check (winner in ('A', 'B')),
  primary key (mix_id, map_order)
);

-- Estatísticas por jogador e mapa. Apenas K/A/D obrigatórios.
create table public.player_map_stats (
  mix_id uuid not null,
  map_order smallint not null,
  player_id uuid not null references public.players (id) on delete cascade,
  side char(1) not null check (side in ('A', 'B')),
  kills smallint not null default 0,
  assists smallint not null default 0,
  deaths smallint not null default 0,
  rounds_played smallint,
  damage integer,
  kast_rounds smallint,
  headshot_kills smallint,
  first_kills smallint,
  first_deaths smallint,
  k2 smallint, k3 smallint, k4 smallint, k5 smallint,
  clutches_won smallint,
  clutches_played smallint,
  primary key (mix_id, map_order, player_id),
  foreign key (mix_id, map_order) references public.mix_maps (mix_id, map_order) on delete cascade
);
create index on public.player_map_stats (player_id);

create type public.match_result as enum ('win', 'loss', 'draw');

create table public.elo_history (
  id bigint generated always as identity primary key,
  community_id uuid not null references public.communities (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  mix_id uuid not null references public.mixes (id) on delete cascade,
  elo_before integer not null,
  elo_after integer not null,
  result public.match_result not null,
  created_at timestamptz not null default now(),
  unique (mix_id, player_id)
);
create index on public.elo_history (community_id, player_id, created_at);

create type public.highlight_kind as enum ('clip', 'ace', 'clutch', 'multikill', 'other');

create table public.highlights (
  id uuid primary key default gen_random_uuid(),
  mix_id uuid not null references public.mixes (id) on delete cascade,
  player_id uuid references public.players (id) on delete set null,
  kind public.highlight_kind not null,
  title text not null,
  url text,
  created_at timestamptz not null default now()
);

create type public.integration_provider as enum ('steam', 'csrep', 'twitch');

-- Contas externas vinculadas (tokens/segredos NUNCA ficam aqui em texto puro)
create table public.external_accounts (
  player_id uuid not null references public.players (id) on delete cascade,
  provider public.integration_provider not null,
  external_id text not null,
  linked_at timestamptz not null default now(),
  primary key (player_id, provider),
  unique (provider, external_id)
);

-- ---------------------------------------------------------------------------
-- Row Level Security: leitura pública; escrita a ser definida por papel.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','players','communities','community_members','maps','mixes','mix_organizers',
    'mix_teams','mix_team_players','mix_maps','player_map_stats','elo_history','highlights','external_accounts'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "leitura publica" on public.%I for select using (true)', t);
  end loop;
end $$;

insert into public.maps (id, name, active) values
  ('de_mirage', 'Mirage', true), ('de_inferno', 'Inferno', true), ('de_nuke', 'Nuke', true),
  ('de_ancient', 'Ancient', true), ('de_anubis', 'Anubis', true), ('de_dust2', 'Dust II', true),
  ('de_train', 'Train', true), ('de_overpass', 'Overpass', false), ('de_vertigo', 'Vertigo', false);
