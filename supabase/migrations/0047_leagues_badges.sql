-- MeuMix — Ligas (Fase 3: insígnias e ajuste de ELO por liga)
-- Executar depois de 0046. Pode ser executado mais de uma vez.
--
-- • Insígnias automáticas passam a ser de uma liga (calculadas só com os mixes dela).
--   As dadas à mão (manuais) continuam valendo em todas as ligas (league_id nulo).
-- • O progresso ("faltam 2 mixes") também é por liga.
-- • As conquistas atuais ficam no Mix de Segunda; o próximo recálculo (ao finalizar
--   um mix, ou em Admin → Insígnias → Recalcular) refaz cada liga com os mixes dela.

alter table public.player_badges
  add column if not exists league_id uuid references public.communities (id) on delete cascade;
create index if not exists player_badges_league_idx on public.player_badges (league_id);

update public.player_badges
set league_id = (select id from public.communities where slug = 'principal')
where source = 'auto' and league_id is null;

alter table public.badge_progress
  add column if not exists league_id uuid references public.communities (id) on delete cascade;
update public.badge_progress
set league_id = (select id from public.communities where slug = 'principal')
where league_id is null;
alter table public.badge_progress alter column league_id set not null;

-- Progresso gravado sem liga (versão antiga do site, até o deploy) vai para o Mix de Segunda.
create or replace function public.badge_progress_default_league()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.league_id is null then
    new.league_id := (select id from public.communities where slug = 'principal');
  end if;
  return new;
end;
$$;

drop trigger if exists badge_progress_default_league on public.badge_progress;
create trigger badge_progress_default_league
  before insert on public.badge_progress
  for each row execute function public.badge_progress_default_league();

-- Chave do progresso: jogador + insígnia + liga.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'badge_progress_pkey'
      and pg_get_constraintdef(oid) not like '%league_id%'
  ) then
    alter table public.badge_progress drop constraint badge_progress_pkey;
    alter table public.badge_progress add constraint badge_progress_pkey primary key (user_id, badge_id, league_id);
  end if;
end;
$$;

-- Grava as insígnias automáticas de uma liga (igual a sync_auto_badges, só nela).
create or replace function public.sync_auto_badges_league(
  p_league uuid,
  p_badges uuid[],
  p_rows jsonb,
  p_progress jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted int;
  v_updated int;
  v_removed int;
begin
  -- Um cálculo por vez.
  perform pg_advisory_xact_lock(hashtext('meumix.sync_auto_badges'));

  -- Conquistas automáticas sem liga (gravadas pela versão antiga) são do Mix de Segunda.
  update public.player_badges
     set league_id = (select id from public.communities where slug = 'principal')
   where source = 'auto' and league_id is null;
  update public.badge_progress
     set league_id = (select id from public.communities where slug = 'principal')
   where league_id is null;

  with d as (
    select * from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as x(user_id uuid, badge_id uuid, source_ref text)
  )
  delete from public.player_badges pb
   using public.badges b
   where b.id = pb.badge_id and pb.badge_id = any (p_badges) and pb.source = 'auto' and b.kind = 'dynamic'
     and not pb.locked and pb.league_id = p_league
     and not exists (
       select 1 from d where d.user_id = pb.user_id and d.badge_id = pb.badge_id and d.source_ref = pb.source_ref
     );
  get diagnostics v_removed = row_count;

  with d as (
    select * from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as x(
      user_id uuid, badge_id uuid, source_ref text, deactivated_at timestamptz, reason text, end_reason text
    )
  )
  update public.player_badges pb
     set deactivated_at = case when d.deactivated_at is null then null
                               else coalesce(pb.deactivated_at, d.deactivated_at) end,
         end_reason = d.end_reason,
         reason = d.reason
    from d
   where pb.user_id = d.user_id and pb.badge_id = d.badge_id and pb.source_ref = d.source_ref and not pb.locked
     and pb.league_id = p_league
     and ((pb.deactivated_at is null) <> (d.deactivated_at is null)
          or pb.reason is distinct from d.reason
          or pb.end_reason is distinct from d.end_reason);
  get diagnostics v_updated = row_count;

  insert into public.player_badges
    (user_id, badge_id, source, source_ref, scope, reason, created_at, deactivated_at, end_reason, league_id)
  select x.user_id, x.badge_id, 'auto', x.source_ref, coalesce(x.scope, ''), x.reason, x.activated_at,
         x.deactivated_at, x.end_reason, p_league
    from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as x(
      user_id uuid, badge_id uuid, source_ref text, scope text,
      activated_at timestamptz, deactivated_at timestamptz, reason text, end_reason text
    )
   where exists (select 1 from public.profiles p where p.id = x.user_id)
  on conflict (user_id, badge_id, source_ref) do nothing;
  get diagnostics v_inserted = row_count;

  delete from public.badge_progress where badge_id = any (p_badges) and league_id = p_league;
  insert into public.badge_progress (user_id, badge_id, league_id, current, target, detail)
  select x.user_id, x.badge_id, p_league, x.current, x.target, left(x.detail, 120)
    from jsonb_to_recordset(coalesce(p_progress, '[]'::jsonb)) as x(user_id uuid, badge_id uuid, current int, target int, detail text)
   where exists (select 1 from public.profiles p where p.id = x.user_id)
  on conflict (user_id, badge_id, league_id) do update
    set current = excluded.current, target = excluded.target, detail = excluded.detail, updated_at = now();

  return jsonb_build_object('inseridas', v_inserted, 'atualizadas', v_updated, 'removidas', v_removed);
end;
$$;

revoke all on function public.sync_auto_badges_league(uuid, uuid[], jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.sync_auto_badges_league(uuid, uuid[], jsonb, jsonb) to service_role;

-- Versão antiga (usada pelo site até o deploy desta fase): grava no Mix de Segunda.
create or replace function public.sync_auto_badges(p_badges uuid[], p_rows jsonb, p_progress jsonb)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.sync_auto_badges_league(
    (select id from public.communities where slug = 'principal'), p_badges, p_rows, p_progress
  );
$$;

revoke all on function public.sync_auto_badges(uuid[], jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.sync_auto_badges(uuid[], jsonb, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Ajuste manual de ELO por liga
-- ---------------------------------------------------------------------------
-- O ELO da liga é recalculado do histórico a cada mix; o ajuste do admin fica
-- guardado como uma diferença sobre o ELO inicial e entra em todo recálculo.
alter table public.league_members add column if not exists elo_offset int not null default 0;

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
  v_offset jsonb;
begin
  if p_league is null then return; end if;
  -- Ajustes manuais do admin: somados ao ELO inicial de cada um.
  select coalesce(jsonb_object_agg(user_id::text, elo_offset), '{}') into v_offset
  from public.league_members where league_id = p_league and elo_offset <> 0;
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
    v_cur := coalesce((v ->> k)::int,
      least(greatest(public.initial_elo_from_gc(r.gc_level) + coalesce((v_offset ->> k)::int, 0), 0), 1600));
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

  -- Membro sem mixes na liga (ex.: o único mix foi excluído) volta ao ELO inicial (+ ajuste).
  update public.league_members lm
  set elo = least(greatest(public.initial_elo_from_gc(pr.gc_level) + lm.elo_offset, 0), 1600),
      level = public.level_for_elo(least(greatest(public.initial_elo_from_gc(pr.gc_level) + lm.elo_offset, 0), 1600)),
      last_elo_change = null
  from public.profiles pr
  where lm.league_id = p_league and pr.id = lm.user_id and not (v ? lm.user_id::text);
end;
$$;


-- Define o ELO de um jogador numa liga agora (o ajuste vale nos próximos mixes).
create or replace function public.set_league_elo(p_league uuid, p_user uuid, p_elo int)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cur int;
  v_elo int;
  v_try int := 0;
begin
  if p_elo < 0 or p_elo > 1600 then raise exception 'ELO_RANGE'; end if;
  insert into public.league_members (league_id, user_id) values (p_league, p_user)
  on conflict (league_id, user_id) do nothing;
  perform public.recompute_league_elo(p_league);
  -- Os limites de 0–1600 a cada mix podem "engolir" parte do ajuste: corrige até chegar.
  loop
    select elo into v_cur from public.league_members where league_id = p_league and user_id = p_user;
    exit when v_cur = p_elo or v_try >= 5;
    update public.league_members set elo_offset = elo_offset + (p_elo - v_cur)
    where league_id = p_league and user_id = p_user;
    perform public.recompute_league_elo(p_league);
    v_try := v_try + 1;
  end loop;
  select elo into v_elo from public.league_members where league_id = p_league and user_id = p_user;
  return v_elo;
end;
$$;

revoke all on function public.set_league_elo(uuid, uuid, int) from public, anon, authenticated;
grant execute on function public.set_league_elo(uuid, uuid, int) to service_role;

-- A liga principal no site é o Mix de Segunda.
update public.communities set name = 'Mix de Segunda', description = 'Liga do mix de segunda'
where slug = 'principal' and name = 'MeuMix';
