-- MeuMix — Campeonatos (Etapa 1): cadastro, organizadores, times e inscritos.
-- Executar depois de 0037. Pode ser executado mais de uma vez.
-- Leitura pública (como os mixes); escrita só pelo servidor, que confere quem
-- pode organizar (quem criou, organizadores liberados pelo super admin).
-- Desfazer: drop table championship_players, championship_teams,
-- championship_organizers, championships (nessa ordem).

create table if not exists public.championships (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{1,80}$'),
  name text not null check (char_length(name) between 2 and 80),
  description text not null default '' check (char_length(description) <= 2000),
  edition text not null default '' check (char_length(edition) <= 40),
  -- Capa reduzida no navegador (JPEG em base64, ~200 KB); servida por /api/campeonatos/<id>/banner.
  banner text check (banner is null or char_length(banner) <= 1500000),
  has_banner boolean generated always as (banner is not null) stored,
  starts_on date,
  ends_on date,
  team_count int not null default 5 check (team_count between 2 and 16),
  players_per_team int not null default 5 check (players_per_team between 2 and 10),
  -- Potes do draft (o capitão é o jogador que não sai de pote).
  pot_count int not null default 4 check (pot_count between 1 and 10),
  group_format text not null default 'round_robin' check (group_format in ('round_robin', 'double_round_robin')),
  group_best_of int not null default 1 check (group_best_of in (1, 3)),
  points_win int not null default 3 check (points_win between 0 and 10),
  points_loss int not null default 0 check (points_loss between 0 and 10),
  playoff_format text not null default 'semis_final' check (playoff_format in ('none', 'final', 'semis_final', 'quarters_semis_final')),
  playoff_best_of int not null default 3 check (playoff_best_of in (1, 3, 5)),
  -- Dias da semana permitidos (0 = domingo … 6 = sábado) e a janela de horário.
  match_days int[] not null default '{1,2}',
  window_start time not null default '21:00',
  window_end time not null default '23:30',
  servers int not null default 3 check (servers between 1 and 10),
  entry_fee numeric(10, 2) not null default 50 check (entry_fee >= 0),
  -- Percentuais da premiação por colocação (1º, 2º, 3º…).
  prize_split numeric[] not null default '{60,25,15}',
  costs numeric(10, 2) not null default 0 check (costs >= 0),
  status text not null default 'setup'
    check (status in ('setup', 'registration', 'teams', 'running', 'playoffs', 'finished', 'cancelled')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

-- Quem pode organizar além de quem criou (liberado pelo super admin).
create table if not exists public.championship_organizers (
  championship_id uuid not null references public.championships (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  granted_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (championship_id, user_id)
);

create table if not exists public.championship_teams (
  id uuid primary key default gen_random_uuid(),
  championship_id uuid not null references public.championships (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  tag text not null default '' check (char_length(tag) <= 5),
  color text not null default '#FF6A00' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  logo text check (logo is null or char_length(logo) <= 400000),
  has_logo boolean generated always as (logo is not null) stored,
  captain_id uuid references public.profiles (id) on delete set null,
  -- Posição na ordem do draft (definida pelo sorteio entre os capitães).
  draft_order int,
  created_at timestamptz not null default now(),
  unique (championship_id, name),
  unique (championship_id, captain_id),
  unique (championship_id, draft_order)
);

-- Inscritos: cada jogador uma vez por campeonato; pote e time saem do draft.
create table if not exists public.championship_players (
  championship_id uuid not null references public.championships (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  pot int check (pot is null or pot between 1 and 10),
  team_id uuid references public.championship_teams (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (championship_id, user_id)
);

create index if not exists championship_teams_ch on public.championship_teams (championship_id);
create index if not exists championship_players_team on public.championship_players (team_id);
create index if not exists championship_players_user on public.championship_players (user_id);

alter table public.championships enable row level security;
alter table public.championship_organizers enable row level security;
alter table public.championship_teams enable row level security;
alter table public.championship_players enable row level security;

drop policy if exists "leitura publica" on public.championships;
create policy "leitura publica" on public.championships for select using (true);
drop policy if exists "leitura publica" on public.championship_organizers;
create policy "leitura publica" on public.championship_organizers for select using (true);
drop policy if exists "leitura publica" on public.championship_teams;
create policy "leitura publica" on public.championship_teams for select using (true);
drop policy if exists "leitura publica" on public.championship_players;
create policy "leitura publica" on public.championship_players for select using (true);
