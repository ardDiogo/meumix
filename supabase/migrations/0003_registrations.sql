-- MeuMix — agenda de mixes e inscrições
-- Executar depois de 0002_auth.sql.

-- Comunidade padrão (a plataforma começa com uma comunidade só).
insert into public.communities (slug, name, description)
values ('principal', 'MeuMix', 'Comunidade principal')
on conflict (slug) do nothing;

-- Inscrições de usuários cadastrados em uma ocorrência de mix (agenda + data).
create table public.mix_registrations (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.mix_schedules (id) on delete cascade,
  event_date date not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (schedule_id, event_date, user_id)
);
create index on public.mix_registrations (schedule_id, event_date, created_at);

alter table public.mix_registrations enable row level security;
create policy "leitura publica" on public.mix_registrations for select using (true);

-- Escritas só pelo servidor (chave secreta), que valida login, horário e permissão.
revoke insert, update, delete on public.mix_registrations from anon, authenticated;
revoke insert, update, delete on public.mix_schedules from anon, authenticated;
