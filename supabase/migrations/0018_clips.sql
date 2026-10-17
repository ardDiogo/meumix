-- MeuMix — clipes do Allstar enviados pelos jogadores
-- (o perfil Allstar sai do Steam ID: allstar.gg/u/<SteamID64>)
-- Executar depois de 0017. Pode ser executado mais de uma vez.

create table if not exists public.clips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  match_id uuid references public.mix_matches (id) on delete set null,
  provider text not null default 'allstar' check (provider in ('allstar')),
  clip_id text not null check (clip_id ~ '^[A-Za-z0-9_-]{6,64}$'),
  title text not null check (char_length(title) between 1 and 80),
  kind text not null default 'clip' check (kind in ('clip', 'ace', 'clutch', 'multikill', 'other')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (provider, clip_id)
);
create index if not exists clips_created_idx on public.clips (created_at desc);
create index if not exists clips_match_idx on public.clips (match_id);
create index if not exists clips_user_idx on public.clips (user_id);

alter table public.clips enable row level security;
drop policy if exists "clips_public_read" on public.clips;
create policy "clips_public_read" on public.clips for select using (true);
