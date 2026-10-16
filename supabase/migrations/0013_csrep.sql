-- MeuMix — CSRep no perfil e análises de desempenho por IA
-- Executar depois de 0012. Pode ser executado mais de uma vez.
-- As análises são só informativas: não entram no ELO nem nas estatísticas do MeuMix.

alter table public.profiles add column if not exists csrep_url text;

create table if not exists public.player_ai_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  source text not null default 'csrep' check (source in ('csrep')),
  metrics jsonb not null default '{}',
  analysis jsonb not null default '{}',
  model text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists player_ai_analyses_user_idx on public.player_ai_analyses (user_id, created_at desc);

alter table public.player_ai_analyses enable row level security;
drop policy if exists "leitura publica" on public.player_ai_analyses;
create policy "leitura publica" on public.player_ai_analyses for select using (true);
revoke insert, update, delete on public.player_ai_analyses from anon, authenticated;
