-- MeuMix — sugestão de times balanceados com votação (regras, seção 7)
-- Executar depois de 0013. Pode ser executado mais de uma vez.

create table if not exists public.mix_team_suggestions (
  schedule_id uuid not null references public.mix_schedules (id) on delete cascade,
  event_date date not null,
  team_a uuid[] not null,
  team_b uuid[] not null,
  score_a numeric(8, 1),
  score_b numeric(8, 1),
  win_prob_a numeric(5, 4),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  primary key (schedule_id, event_date)
);

create table if not exists public.mix_team_suggestion_votes (
  schedule_id uuid not null,
  event_date date not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  agree boolean not null,
  created_at timestamptz not null default now(),
  primary key (schedule_id, event_date, user_id),
  foreign key (schedule_id, event_date) references public.mix_team_suggestions (schedule_id, event_date) on delete cascade
);

alter table public.mix_team_suggestions enable row level security;
alter table public.mix_team_suggestion_votes enable row level security;
drop policy if exists "leitura publica" on public.mix_team_suggestions;
create policy "leitura publica" on public.mix_team_suggestions for select using (true);
drop policy if exists "leitura publica" on public.mix_team_suggestion_votes;
create policy "leitura publica" on public.mix_team_suggestion_votes for select using (true);
revoke insert, update, delete on public.mix_team_suggestions, public.mix_team_suggestion_votes from anon, authenticated;

-- A chave já existe desde a 0006 (desligada por padrão).
insert into public.feature_settings (feature_key, enabled) values ('team_suggestion', false)
on conflict (feature_key) do nothing;

do $$
declare t text;
begin
  foreach t in array array['mix_team_suggestions', 'mix_team_suggestion_votes'] loop
    if not exists (
      select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
