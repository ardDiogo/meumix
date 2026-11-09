-- MeuMix — Ligas (Fase 2: separar pela data e ELO por liga)
-- Executar depois de 0045. Pode ser executado mais de uma vez (refaz a separação pela data).
--
-- • Mix numa terça → Mix de Terça; qualquer outro dia → Mix de Segunda.
-- • A agenda de terça passa para o Mix de Terça (os próximos mixes dela já nascem lá).
-- • ELO de cada liga = ELO inicial do nível GC + RP de cada mix daquela liga, em ordem
--   de data, limitado a 0–1600 a cada mix (a mesma regra da finalização).
-- • Nada é apagado: o ELO de hoje (profiles, elo_before/elo_after) continua como está.
--   O ELO por liga fica em league_members e league_elo_history e é recalculado sozinho
--   sempre que um mix é finalizado, excluído, muda de data ou tem convidado vinculado.

-- ---------------------------------------------------------------------------
-- ELO por liga em cada registro de jogador
-- ---------------------------------------------------------------------------
create table if not exists public.league_elo_history (
  record_id uuid primary key references public.player_match_records (id) on delete cascade,
  league_id uuid not null references public.communities (id) on delete cascade,
  match_id uuid not null references public.mix_matches (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  event_date date not null,
  elo_before int not null,
  elo_after int not null,
  level_before smallint not null,
  level_after smallint not null
);
create index if not exists league_elo_history_user_idx on public.league_elo_history (league_id, user_id, event_date);

alter table public.league_elo_history enable row level security;
drop policy if exists "leitura publica" on public.league_elo_history;
create policy "leitura publica" on public.league_elo_history for select using (true);
revoke insert, update, delete on public.league_elo_history from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Recalcula do zero o ELO de uma liga
-- ---------------------------------------------------------------------------
create or replace function public.recompute_league_elo(p_league uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v jsonb := '{}';
  v_last jsonb := '{}';
  k text;
  v_cur int;
  v_next int;
begin
  if p_league is null then return; end if;
  delete from public.league_elo_history where league_id = p_league;

  for r in
    select p.id rid, p.match_id, p.user_id, p.rp, p.calculate_elo, m.event_date, pr.gc_level
    from public.player_match_records p
    join public.mix_matches m on m.id = p.match_id
    join public.profiles pr on pr.id = p.user_id
    where m.league_id = p_league
    order by m.event_date, m.finalized_at, m.id, p.id
  loop
    k := r.user_id::text;
    v_cur := coalesce((v ->> k)::int, public.initial_elo_from_gc(r.gc_level));
    v_next := case when r.calculate_elo then least(greatest(v_cur + r.rp, 0), 1600) else v_cur end;
    insert into public.league_elo_history
      (record_id, league_id, match_id, user_id, event_date, elo_before, elo_after, level_before, level_after)
    values (r.rid, p_league, r.match_id, r.user_id, r.event_date, v_cur, v_next,
            public.level_for_elo(v_cur), public.level_for_elo(v_next));
    v := v || jsonb_build_object(k, v_next);
    if r.calculate_elo then v_last := v_last || jsonb_build_object(k, v_next - v_cur); end if;
  end loop;

  insert into public.league_members (league_id, user_id, elo, level, last_elo_change)
  select p_league, e.key::uuid, e.value::int, public.level_for_elo(e.value::int), (v_last ->> e.key)::int
  from jsonb_each_text(v) e
  on conflict (league_id, user_id) do update
    set elo = excluded.elo, level = excluded.level, last_elo_change = excluded.last_elo_change;

  -- Membro sem mixes na liga (ex.: o único mix foi excluído) volta ao ELO inicial.
  update public.league_members lm
  set elo = public.initial_elo_from_gc(pr.gc_level),
      level = public.level_for_elo(public.initial_elo_from_gc(pr.gc_level)),
      last_elo_change = null
  from public.profiles pr
  where lm.league_id = p_league and pr.id = lm.user_id and not (v ? lm.user_id::text);
end;
$$;

revoke all on function public.recompute_league_elo(uuid) from public, anon, authenticated;
grant execute on function public.recompute_league_elo(uuid) to service_role;

-- Uma vez por transação e por liga (a finalização grava vários registros de uma vez).
create or replace function public.recompute_league_once(p_league uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  k text;
begin
  if p_league is null then return; end if;
  k := 'meumix.league_' || replace(p_league::text, '-', '');
  if coalesce(current_setting(k, true), '') = '1' then return; end if;
  perform set_config(k, '1', true);
  perform public.recompute_league_elo(p_league);
end;
$$;

revoke all on function public.recompute_league_once(uuid) from public, anon, authenticated;

-- Gatilhos adiados: rodam no fim da transação, quando o mix já está todo gravado.
create or replace function public.league_elo_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_league uuid;
begin
  if tg_table_name = 'mix_matches' then
    if tg_op <> 'INSERT' then perform public.recompute_league_once(old.league_id); end if;
    if tg_op <> 'DELETE' then perform public.recompute_league_once(new.league_id); end if;
  else
    if tg_op <> 'INSERT' then
      select league_id into v_league from public.mix_matches where id = old.match_id;
      perform public.recompute_league_once(v_league);
    end if;
    if tg_op <> 'DELETE' then
      select league_id into v_league from public.mix_matches where id = new.match_id;
      perform public.recompute_league_once(v_league);
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists league_elo_matches on public.mix_matches;
create constraint trigger league_elo_matches
  after insert or delete or update of event_date, finalized_at, league_id on public.mix_matches
  deferrable initially deferred
  for each row execute function public.league_elo_changed();

drop trigger if exists league_elo_records on public.player_match_records;
create constraint trigger league_elo_records
  after insert or delete or update of user_id, rp, calculate_elo, match_id on public.player_match_records
  deferrable initially deferred
  for each row execute function public.league_elo_changed();

-- ---------------------------------------------------------------------------
-- Prévia (só leitura) agora com o ELO inicial do nível GC (opção B)
-- ---------------------------------------------------------------------------
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
    select public.league_for_date(m.event_date) slug, p.user_id uid, p.rp, p.calculate_elo, pr.gc_level
    from public.player_match_records p
    join public.mix_matches m on m.id = p.match_id
    join public.profiles pr on pr.id = p.user_id
    order by m.event_date, m.finalized_at, m.id, p.id
  loop
    k := r.slug || ':' || r.uid;
    v := v || jsonb_build_object(k, case when r.calculate_elo
      then least(greatest(coalesce((v ->> k)::int, public.initial_elo_from_gc(r.gc_level)) + r.rp, 0), 1600)
      else coalesce((v ->> k)::int, public.initial_elo_from_gc(r.gc_level)) end);
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
    (v ->> (pl.slug || ':' || pl.uid))::int,
    public.level_for_elo((v ->> (pl.slug || ':' || pl.uid))::int)
  from played pl
  join public.communities c on c.slug = pl.slug
  join public.profiles pr on pr.id = pl.uid
  order by c.sort_order, 6 desc, pr.display_name;
end;
$$;

revoke all on function public.league_split_preview() from public, anon, authenticated;
grant execute on function public.league_split_preview() to service_role;

-- ---------------------------------------------------------------------------
-- Aplica a separação
-- ---------------------------------------------------------------------------
-- Mixes finalizados: pela data.
update public.mix_matches m
set league_id = c.id
from public.communities c
where c.slug = public.league_for_date(m.event_date) and m.league_id is distinct from c.id;

update public.elo_change_logs l
set league_id = m.league_id
from public.mix_matches m
where l.match_id = m.id and l.league_id is distinct from m.league_id;

-- Agendas: a semanal de terça e as avulsas numa terça vão para o Mix de Terça.
update public.mix_schedules s
set community_id = (select id from public.communities where slug = 'terca')
where ((s.recurrence_kind = 'weekly' and s.weekday = 2)
    or (s.recurrence_kind = 'once' and extract(isodow from s.event_date) = 2))
  and s.community_id is distinct from (select id from public.communities where slug = 'terca');

-- ELO de cada liga.
select public.recompute_league_once(id) from public.communities where slug in ('principal', 'terca');
