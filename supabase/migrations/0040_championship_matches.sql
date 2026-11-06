-- MeuMix — Campeonatos (Etapa 6): confrontos, calendário e agendamento pelos capitães.
-- Executar depois de 0039. Pode ser executado mais de uma vez.
-- Leitura pública; escrita só pelo servidor. Nada aqui toca nas tabelas do mix.
-- Desfazer: drop table championship_match_proposals, championship_matches (nessa ordem).

do $$
begin
  if to_regclass('public.championship_drafts') is null then
    raise exception 'Rode primeiro a migração 0039_championship_draft.sql.';
  end if;
end $$;

create table if not exists public.championship_matches (
  id uuid primary key default gen_random_uuid(),
  championship_id uuid not null references public.championships (id) on delete cascade,
  stage text not null default 'group' check (stage in ('group', 'playoff')),
  round int not null check (round between 1 and 60),
  -- Ida e volta: 1 (ida) ou 2 (volta). Nos playoffs, a posição na chave.
  leg int not null default 1 check (leg between 1 and 8),
  home_team uuid references public.championship_teams (id) on delete cascade,
  away_team uuid references public.championship_teams (id) on delete cascade,
  best_of int not null default 1 check (best_of in (1, 3, 5)),
  scheduled_at timestamptz,
  server int check (server is null or server between 1 and 10),
  status text not null default 'pending'
    check (status in ('pending', 'proposed', 'approval', 'scheduled', 'live', 'finished', 'postponed', 'cancelled')),
  winner_team uuid references public.championship_teams (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (home_team is null or away_team is null or home_team <> away_team)
);
-- Proteção contra confronto duplicado na fase classificatória (mesmo par, mesma perna).
create unique index if not exists championship_matches_pair
  on public.championship_matches (championship_id, stage, leg, least(home_team, away_team), greatest(home_team, away_team))
  where stage = 'group';
create index if not exists championship_matches_ch on public.championship_matches (championship_id, round);

-- Propostas de data entre os capitães (com histórico: aceitas, recusadas, substituídas).
create table if not exists public.championship_match_proposals (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.championship_matches (id) on delete cascade,
  championship_id uuid not null references public.championships (id) on delete cascade,
  proposed_by_team uuid not null references public.championship_teams (id) on delete cascade,
  proposed_by uuid references public.profiles (id) on delete set null,
  starts_at timestamptz not null,
  note text not null default '' check (char_length(note) <= 200),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'superseded', 'cancelled')),
  responded_by uuid references public.profiles (id) on delete set null,
  responded_at timestamptz,
  created_at timestamptz not null default now()
);
-- Uma proposta em aberto por jogo.
create unique index if not exists championship_proposals_open
  on public.championship_match_proposals (match_id) where status = 'pending';
create index if not exists championship_proposals_ch on public.championship_match_proposals (championship_id, created_at);

alter table public.championship_matches enable row level security;
alter table public.championship_match_proposals enable row level security;
drop policy if exists "leitura publica" on public.championship_matches;
create policy "leitura publica" on public.championship_matches for select using (true);
drop policy if exists "leitura publica" on public.championship_match_proposals;
create policy "leitura publica" on public.championship_match_proposals for select using (true);

do $$
declare t text;
begin
  foreach t in array array['championship_matches', 'championship_match_proposals'] loop
    if not exists (
      select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
