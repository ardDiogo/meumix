-- MeuMix — Ligas (Fase 1: base invisível)
-- Executar depois de 0044. Pode ser executado mais de uma vez.
--
-- Cada mix semanal vira uma liga (tabela communities, que já existia):
--   "principal" = Mix de Segunda (todo o histórico atual fica nela por enquanto)
--   "terca"     = Mix de Terça (vazia até a Fase 2 separar os mixes pela data)
-- Nada muda para quem usa o site: o app continua lendo o ELO de profiles.
-- A Fase 2 recalcula o ELO de cada liga do zero (0 + RP dos mixes daquela liga).

-- ---------------------------------------------------------------------------
-- Ligas
-- ---------------------------------------------------------------------------
alter table public.communities
  add column if not exists weekday smallint check (weekday between 0 and 6),
  add column if not exists sort_order smallint not null default 0;

update public.communities set weekday = 1 where slug = 'principal' and weekday is null;

insert into public.communities (slug, name, description, starting_elo, weekday, sort_order)
values ('terca', 'Mix de Terça', 'Liga do mix de terça', 0, 2, 1)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Membros da liga, com ELO e nível próprios em cada uma
-- ---------------------------------------------------------------------------
create table if not exists public.league_members (
  league_id uuid not null references public.communities (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'player' check (role in ('admin', 'player')),
  elo int not null default 0 check (elo between 0 and 1600),
  level smallint not null default 1,
  last_elo_change int,
  joined_at timestamptz not null default now(),
  primary key (league_id, user_id)
);
create index if not exists league_members_user_idx on public.league_members (user_id);

alter table public.league_members enable row level security;
drop policy if exists "leitura publica" on public.league_members;
create policy "leitura publica" on public.league_members for select using (true);
revoke insert, update, delete on public.league_members from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Cada mix finalizado e cada mudança de ELO pertencem a uma liga
-- ---------------------------------------------------------------------------
alter table public.mix_matches
  add column if not exists league_id uuid references public.communities (id) on delete restrict;
alter table public.elo_change_logs
  add column if not exists league_id uuid references public.communities (id) on delete set null;
create index if not exists mix_matches_league_idx on public.mix_matches (league_id, event_date desc);

-- Liga padrão de um mix: a da agenda; sem agenda, a principal.
create or replace function public.league_of_schedule(p_schedule uuid)
returns uuid
language sql stable
set search_path = ''
as $$
  select coalesce(
    (select community_id from public.mix_schedules where id = p_schedule),
    (select id from public.communities where slug = 'principal')
  );
$$;

create or replace function public.mix_matches_set_league()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.league_id is null then
    new.league_id := public.league_of_schedule(new.schedule_id);
  end if;
  return new;
end;
$$;

drop trigger if exists mix_matches_set_league on public.mix_matches;
create trigger mix_matches_set_league
  before insert on public.mix_matches
  for each row execute function public.mix_matches_set_league();

create or replace function public.elo_change_logs_set_league()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.league_id is null and new.match_id is not null then
    select league_id into new.league_id from public.mix_matches where id = new.match_id;
  end if;
  return new;
end;
$$;

drop trigger if exists elo_change_logs_set_league on public.elo_change_logs;
create trigger elo_change_logs_set_league
  before insert on public.elo_change_logs
  for each row execute function public.elo_change_logs_set_league();

-- Histórico atual: tudo na liga da agenda (hoje, a principal).
update public.mix_matches set league_id = public.league_of_schedule(schedule_id) where league_id is null;
update public.elo_change_logs l set league_id = m.league_id
from public.mix_matches m
where l.match_id = m.id and l.league_id is null;

-- ---------------------------------------------------------------------------
-- Fase 2 (só leitura): como fica a separação pela data, sem gravar nada.
-- Terça → Mix de Terça; qualquer outro dia → Mix de Segunda.
-- ---------------------------------------------------------------------------
create or replace function public.league_for_date(p_date date)
returns text
language sql immutable
set search_path = ''
as $$
  select case when extract(isodow from p_date) = 2 then 'terca' else 'principal' end;
$$;

-- ELO de cada jogador em cada liga: começa em 0 e soma o RP de cada mix da
-- liga, em ordem de data, limitado a 0–1600 a cada mix (como na finalização).
create or replace function public.league_split_preview()
returns table (
  liga text,
  user_id uuid,
  jogador text,
  mixes bigint,
  elo_atual int,
  elo_liga int,
  nivel_liga smallint
)
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  r record;
  v jsonb := '{}';
  k text;
begin
  for r in
    select public.league_for_date(m.event_date) slug, p.user_id uid, p.rp
    from public.player_match_records p
    join public.mix_matches m on m.id = p.match_id
    where p.user_id is not null and p.calculate_elo
    order by m.event_date, m.finalized_at, m.id
  loop
    k := r.slug || ':' || r.uid;
    v := v || jsonb_build_object(k, least(greatest(coalesce((v ->> k)::int, 0) + r.rp, 0), 1600));
  end loop;

  return query
  with played as (
    select public.league_for_date(m.event_date) slug, p.user_id uid, count(distinct p.match_id) n
    from public.player_match_records p
    join public.mix_matches m on m.id = p.match_id
    where p.user_id is not null
    group by 1, 2
  )
  select
    case when c.slug = 'principal' then 'Mix de Segunda' else c.name end,
    pl.uid,
    pr.display_name,
    pl.n,
    pr.elo,
    coalesce((v ->> (pl.slug || ':' || pl.uid))::int, 0),
    public.level_for_elo(coalesce((v ->> (pl.slug || ':' || pl.uid))::int, 0))
  from played pl
  join public.communities c on c.slug = pl.slug
  join public.profiles pr on pr.id = pl.uid
  order by c.sort_order, 6 desc, pr.display_name;
end;
$$;

revoke all on function public.league_split_preview() from public, anon, authenticated;
grant execute on function public.league_split_preview() to service_role;
