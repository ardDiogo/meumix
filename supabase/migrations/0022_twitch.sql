-- MeuMix — canal da Twitch de cada jogador e clipes importados da Twitch
-- Executar depois de 0021. Pode ser executado mais de uma vez.

alter table public.profiles add column if not exists twitch_login text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_twitch_login_format') then
    alter table public.profiles
      add constraint profiles_twitch_login_format check (twitch_login is null or twitch_login ~ '^[a-z0-9_]{3,25}$');
  end if;
end $$;

-- Um canal por jogador.
create unique index if not exists profiles_twitch_login_key on public.profiles (twitch_login) where twitch_login is not null;

-- Clipes: além do Allstar, a Twitch (os códigos dos clipes da Twitch são mais longos).
alter table public.clips drop constraint if exists clips_provider_check;
alter table public.clips add constraint clips_provider_check check (provider in ('allstar', 'twitch'));
alter table public.clips drop constraint if exists clips_clip_id_check;
alter table public.clips add constraint clips_clip_id_check check (clip_id ~ '^[A-Za-z0-9_-]{6,100}$');
