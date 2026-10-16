-- MeuMix — insígnias (criadas pelo admin e concedidas aos jogadores)
-- Executar depois de 0014. Pode ser executado mais de uma vez.

create table if not exists public.badges (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 40),
  description text check (char_length(description) <= 200),
  icon text not null default 'trophy',
  color text not null default '#FF6A00' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists badges_name_key on public.badges (lower(name));

create table if not exists public.player_badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  badge_id uuid not null references public.badges (id) on delete cascade,
  note text check (char_length(note) <= 140),
  assigned_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, badge_id)
);
create index if not exists player_badges_user_idx on public.player_badges (user_id);

alter table public.badges enable row level security;
alter table public.player_badges enable row level security;
drop policy if exists "leitura publica" on public.badges;
create policy "leitura publica" on public.badges for select using (true);
drop policy if exists "leitura publica" on public.player_badges;
create policy "leitura publica" on public.player_badges for select using (true);
revoke insert, update, delete on public.badges, public.player_badges from anon, authenticated;

-- Logs: leitura só pelo servidor (tela de logs do admin).
revoke all on public.audit_log from anon, authenticated;
create index if not exists audit_log_action_idx on public.audit_log (action, created_at desc);
