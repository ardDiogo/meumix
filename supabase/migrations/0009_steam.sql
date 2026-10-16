-- MeuMix — perfil da Steam (foto e SteamID) no perfil do jogador
-- Executar depois de 0008. Pode ser executado mais de uma vez.

alter table public.profiles add column if not exists steam_id text;
alter table public.profiles add column if not exists steam_url text;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists steam_synced_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_steam_id_format') then
    alter table public.profiles
      add constraint profiles_steam_id_format check (steam_id is null or steam_id ~ '^7656119\d{10}$');
  end if;
end $$;

-- Uma conta Steam por jogador.
create unique index if not exists profiles_steam_id_key on public.profiles (steam_id) where steam_id is not null;
