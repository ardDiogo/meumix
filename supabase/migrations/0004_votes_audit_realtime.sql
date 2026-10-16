-- MeuMix — Fase 1: dispositivo, cancelamentos, auditoria, votos e tempo real
-- Executar depois de 0003_registrations.sql. Pode ser executado mais de uma vez. Ver docs/regras-do-mix.md (seções 2, 3, 4 e 11).

-- Dispositivo usado na inscrição (seção 12).
alter table public.mix_registrations
  add column if not exists device text check (device in ('mobile', 'desktop'));

-- Registro de quem cancelou a inscrição (seção 12).
create table if not exists public.mix_cancellations (
  id bigint generated always as identity primary key,
  schedule_id uuid not null references public.mix_schedules (id) on delete cascade,
  event_date date not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  registered_at timestamptz not null,
  cancelled_at timestamptz not null default now(),
  cancelled_by uuid references public.profiles (id) on delete set null
);

-- Log de auditoria de ações sensíveis (seções 2 e 10). Lido só pelo servidor.
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  action text not null,          -- ex.: registration.join, registration.leave, admin.remove_registration
  outcome text not null,         -- ex.: success, too_early, already_registered, closed, error
  actor_id uuid references public.profiles (id) on delete set null,
  schedule_id uuid references public.mix_schedules (id) on delete set null,
  event_date date,
  detail jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_log_created_at_idx on public.audit_log (created_at desc);

-- Votos de mapas: exatamente 4 por jogador por mix (validado no servidor).
create table if not exists public.map_votes (
  schedule_id uuid not null references public.mix_schedules (id) on delete cascade,
  event_date date not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  map_id text not null references public.maps (id),
  created_at timestamptz not null default now(),
  primary key (schedule_id, event_date, user_id, map_id)
);

-- Votos de capitão: até 2 por jogador, nunca em si mesmo.
create table if not exists public.captain_votes (
  schedule_id uuid not null references public.mix_schedules (id) on delete cascade,
  event_date date not null,
  voter_id uuid not null references public.profiles (id) on delete cascade,
  candidate_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (schedule_id, event_date, voter_id, candidate_id),
  check (voter_id <> candidate_id)
);

-- Leitura pública (exceto auditoria); escrita só pelo servidor.
alter table public.mix_cancellations enable row level security;
alter table public.audit_log enable row level security;
alter table public.map_votes enable row level security;
alter table public.captain_votes enable row level security;
drop policy if exists "leitura publica" on public.mix_cancellations;
create policy "leitura publica" on public.mix_cancellations for select using (true);
drop policy if exists "leitura publica" on public.map_votes;
create policy "leitura publica" on public.map_votes for select using (true);
drop policy if exists "leitura publica" on public.captain_votes;
create policy "leitura publica" on public.captain_votes for select using (true);
revoke insert, update, delete on public.mix_cancellations, public.audit_log, public.map_votes, public.captain_votes
  from anon, authenticated;
revoke select on public.audit_log from anon, authenticated;

-- Tempo real: a tela atualiza sozinha quando estas tabelas mudam (seção 11).
do $$
declare t text;
begin
  foreach t in array array['mix_schedules', 'mix_registrations', 'map_votes', 'captain_votes'] loop
    if not exists (
      select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
