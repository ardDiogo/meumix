-- MeuMix — Campeonatos (Etapas 4 e 5): potes, adedonha entre os capitães e draft em serpentina.
-- Executar depois de 0038. Pode ser executado mais de uma vez.
-- Leitura pública, menos as jogadas da adedonha (ninguém vê o número do outro antes da hora).
-- Escrita só pelo servidor. Nada aqui toca nas tabelas do mix.
-- Desfazer: drop table championship_picks, championship_adedonha_moves,
-- championship_adedonha_rounds, championship_drafts (nessa ordem).

do $$
begin
  if to_regclass('public.championships') is null then
    raise exception 'Rode primeiro a migração 0038_championships.sql.';
  end if;
end $$;

-- Andamento do draft: ordem (adedonha) → escolhas → concluído. Sem linha = montando os potes.
create table if not exists public.championship_drafts (
  championship_id uuid primary key references public.championships (id) on delete cascade,
  status text not null default 'order' check (status in ('order', 'picking', 'done')),
  started_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Cada rodada da adedonha define o próximo da ordem de escolha.
create table if not exists public.championship_adedonha_rounds (
  championship_id uuid not null references public.championships (id) on delete cascade,
  round int not null check (round between 1 and 16),
  -- A contagem começa neste time (sorteado pelo servidor).
  start_team uuid not null references public.championship_teams (id) on delete cascade,
  -- Times ainda sem posição, na ordem da roda.
  remaining uuid[] not null,
  -- Quem já jogou nesta rodada (sem o número).
  played uuid[] not null default '{}',
  -- Revelado só quando todos jogam: { "<team_id>": número }.
  revealed jsonb,
  total int,
  picked_team uuid references public.championship_teams (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (championship_id, round)
);

-- Números escolhidos (0 a 5), sem leitura pública.
create table if not exists public.championship_adedonha_moves (
  championship_id uuid not null,
  round int not null,
  team_id uuid not null references public.championship_teams (id) on delete cascade,
  value int not null check (value between 0 and 5),
  played_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (championship_id, round, team_id),
  foreign key (championship_id, round) references public.championship_adedonha_rounds (championship_id, round) on delete cascade
);

-- Escolhas do draft, com histórico: desfazer marca `undone_at` em vez de apagar.
create table if not exists public.championship_picks (
  id uuid primary key default gen_random_uuid(),
  championship_id uuid not null references public.championships (id) on delete cascade,
  pick_no int not null check (pick_no >= 1),
  pot int not null check (pot between 1 and 10),
  team_id uuid not null references public.championship_teams (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  picked_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  undone_at timestamptz,
  undone_by uuid references public.profiles (id) on delete set null
);
-- Proteção contra duplicidade: uma escolha por vez e cada jogador uma vez (entre as válidas).
create unique index if not exists championship_picks_slot on public.championship_picks (championship_id, pick_no)
  where undone_at is null;
create unique index if not exists championship_picks_player on public.championship_picks (championship_id, user_id)
  where undone_at is null;
create index if not exists championship_picks_ch on public.championship_picks (championship_id, created_at);

alter table public.championship_drafts enable row level security;
alter table public.championship_adedonha_rounds enable row level security;
alter table public.championship_adedonha_moves enable row level security;
alter table public.championship_picks enable row level security;

drop policy if exists "leitura publica" on public.championship_drafts;
create policy "leitura publica" on public.championship_drafts for select using (true);
drop policy if exists "leitura publica" on public.championship_adedonha_rounds;
create policy "leitura publica" on public.championship_adedonha_rounds for select using (true);
drop policy if exists "leitura publica" on public.championship_picks;
create policy "leitura publica" on public.championship_picks for select using (true);
-- championship_adedonha_moves: sem política de leitura (só o servidor).
revoke all on public.championship_adedonha_moves from anon, authenticated;

-- Tempo real: a tela do draft atualiza sozinha.
do $$
declare t text;
begin
  foreach t in array array['championship_drafts', 'championship_adedonha_rounds', 'championship_picks', 'championship_players', 'championship_teams'] loop
    if not exists (
      select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
