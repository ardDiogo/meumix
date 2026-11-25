-- MeuMix — PTS nova: morte trocada pesa menos, FK vale mais
-- Executar depois de 0059. Pode ser executado mais de uma vez.
--
--   PTS = 3 × K + 1,5 × A + 2 × FK + 0,2 × ADR − 0,5 × morte trocada − 1,5 × morte não trocada
--   (sem os dados de trade da GC: − 1,5 × toda morte)
--
-- • player_match_records.traded_deaths: mortes do jogador que um colega trocou (dados da GC).
--   O site preenche ao finalizar; os mixes antigos, em Admin → Configurações → "Recalcular
--   PTS com os trades da GC".
-- • Recalcula o MVP de todos os mixes e o ELO das ligas (o desempenho do ELO usa a PTS).

alter table public.player_match_records add column if not exists traded_deaths int;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'player_match_records_traded_deaths_check') then
    alter table public.player_match_records
      add constraint player_match_records_traded_deaths_check check (traded_deaths is null or traded_deaths >= 0);
  end if;
end $$;

-- A PTS num lugar só (MVP, ordem da planilha e desempenho do ELO).
create or replace function public.mix_pts(p_k int, p_a int, p_fk int, p_adr numeric, p_d int, p_traded int)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select p_k * 3 + p_a * 1.5 + p_fk * 2 + coalesce(p_adr, 0) * 0.2
       - case when p_traded is null then p_d * 1.5
              else least(p_traded, p_d) * 0.5 + (p_d - least(p_traded, p_d)) * 1.5 end;
$$;

-- Calcula, sem gravar, o histórico de ELO de uma liga com o RP do MeuMix.
create or replace function public.league_elo_compute(p_league uuid)
returns table (
  seq int,
  record_id uuid,
  match_id uuid,
  user_id uuid,
  event_date date,
  counted boolean,
  elo_before int,
  elo_after int,
  rp int,
  rp_result numeric,
  rp_perf numeric,
  pts numeric,
  pts_avg numeric,
  rp_gc int
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  m record;
  r record;
  v jsonb := '{}';      -- ELO atual de cada jogador na liga
  v_next jsonb;
  v_offset jsonb;
  v_initial jsonb;
  v_seq int := 0;
  v_avg_a numeric;
  v_avg_b numeric;
  v_pts_avg numeric;
  v_stats boolean;
  v_cur int;
  v_s numeric;
  v_e numeric;
  v_res numeric;
  v_perf numeric;
  v_rp int;
  v_pts numeric;
begin
  if p_league is null then return; end if;
  select coalesce(jsonb_object_agg(lm.user_id::text, lm.elo_offset), '{}') into v_offset
  from public.league_members lm where lm.league_id = p_league and lm.elo_offset <> 0;
  -- ELO inicial (nível GC + ajuste do admin) de quem já jogou na liga.
  select coalesce(jsonb_object_agg(pr.id::text,
           least(greatest(public.initial_elo_from_gc(pr.gc_level) + coalesce((v_offset ->> pr.id::text)::int, 0), 0), 1600)), '{}')
    into v_initial
  from public.profiles pr
  where exists (
    select 1 from public.player_match_records p join public.mix_matches mm on mm.id = p.match_id
    where mm.league_id = p_league and p.user_id = pr.id
  );

  for m in
    select mm.id, mm.event_date from public.mix_matches mm
    where mm.league_id = p_league
    order by mm.event_date, mm.finalized_at, mm.id
  loop
    -- Média da PTS (todos os 10, convidados também) e ELO médio de cada time (só contas).
    select
      avg(public.mix_pts(p.kills, p.assists, p.first_kills, p.adr, p.deaths, p.traded_deaths)),
      bool_or(p.kills > 0 or p.deaths > 0),
      avg(coalesce((v ->> p.user_id::text)::int, (v_initial ->> p.user_id::text)::int))
        filter (where p.team = 'A' and p.user_id is not null),
      avg(coalesce((v ->> p.user_id::text)::int, (v_initial ->> p.user_id::text)::int))
        filter (where p.team = 'B' and p.user_id is not null)
    into v_pts_avg, v_stats, v_avg_a, v_avg_b
    from public.player_match_records p where p.match_id = m.id;
    v_next := '{}';
    v_avg_a := coalesce(v_avg_a, v_avg_b, 0);
    v_avg_b := coalesce(v_avg_b, v_avg_a, 0);

    for r in
      select p.id, p.user_id, p.team, p.wins, p.losses, p.calculate_elo, p.rp,
             public.mix_pts(p.kills, p.assists, p.first_kills, p.adr, p.deaths, p.traded_deaths) as score
      from public.player_match_records p
      where p.match_id = m.id and p.user_id is not null
        and exists (select 1 from public.profiles pr where pr.id = p.user_id)
      order by p.id
    loop
      v_cur := coalesce((v ->> r.user_id::text)::int, (v_initial ->> r.user_id::text)::int, 0);
      v_s := case when r.wins > r.losses then 1 when r.wins = r.losses then 0.5 else 0 end;
      v_e := case when r.team = 'A' then 1 / (1 + power(10, (v_avg_b - v_avg_a) / 400.0))
                  else 1 / (1 + power(10, (v_avg_a - v_avg_b) / 400.0)) end;
      v_res := round(40 * (v_s - v_e), 2);
      v_pts := r.score;
      v_perf := case when v_stats and v_pts_avg is not null
        then round(least(greatest(30 * (r.score - v_pts_avg) / greatest(abs(v_pts_avg), 1), -20), 20), 2)
        else 0 end;
      v_rp := round(v_res + v_perf);
      v_seq := v_seq + 1;

      seq := v_seq;
      record_id := r.id;
      match_id := m.id;
      user_id := r.user_id;
      event_date := m.event_date;
      counted := r.calculate_elo;
      elo_before := v_cur;
      elo_after := case when r.calculate_elo then least(greatest(v_cur + v_rp, 0), 1600) else v_cur end;
      rp := v_rp;
      rp_result := v_res;
      rp_perf := v_perf;
      pts := round(v_pts, 2);
      pts_avg := round(v_pts_avg, 2);
      rp_gc := r.rp;
      v_next := v_next || jsonb_build_object(r.user_id::text, elo_after);
      return next;
    end loop;

    -- Os ELOs mudam só depois do mix inteiro (a força dos times usa o ELO de antes).
    v := v || v_next;
  end loop;
end;
$$;

revoke all on function public.league_elo_compute(uuid) from public, anon, authenticated;
grant execute on function public.league_elo_compute(uuid) to service_role;

-- MVP de cada mix pela PTS (empate: mais kills, depois mais assistências). Sem estatísticas, sem MVP.
create or replace function public.recalc_mvps(p_matches uuid[] default null)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v int;
begin
  with ranked as (
    select p.id,
      row_number() over (
        partition by p.match_id
        order by public.mix_pts(p.kills, p.assists, p.first_kills, p.adr, p.deaths, p.traded_deaths) desc,
                 p.kills desc, p.assists desc
      ) as pos,
      bool_or(p.kills > 0 or p.deaths > 0) over (partition by p.match_id) as has_stats
    from public.player_match_records p
    where p_matches is null or p.match_id = any (p_matches)
  )
  update public.player_match_records p
  set is_mvp = (r.pos = 1 and r.has_stats)
  from ranked r
  where r.id = p.id and p.is_mvp is distinct from (r.pos = 1 and r.has_stats);
  get diagnostics v = row_count;
  return v;
end;
$$;

revoke all on function public.recalc_mvps(uuid[]) from public, anon, authenticated;
grant execute on function public.recalc_mvps(uuid[]) to service_role;

-- Grava as mortes trocadas ([{record_id, traded}]) e refaz o MVP desses mixes (uma transação:
-- o ELO das ligas é recalculado uma vez só, pelo gatilho adiado).
create or replace function public.set_traded_deaths(p_rows jsonb)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v int;
  v_matches uuid[];
begin
  with x as (select * from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as t(record_id uuid, traded int))
  update public.player_match_records p
  set traded_deaths = greatest(x.traded, 0)
  from x
  where p.id = x.record_id and p.traded_deaths is distinct from greatest(x.traded, 0);
  get diagnostics v = row_count;
  select array_agg(distinct p.match_id) into v_matches
  from public.player_match_records p
  where p.id in (select (e ->> 'record_id')::uuid from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) e);
  if v_matches is not null then perform public.recalc_mvps(v_matches); end if;
  return v;
end;
$$;

revoke all on function public.set_traded_deaths(jsonb) from public, anon, authenticated;
grant execute on function public.set_traded_deaths(jsonb) to service_role;

-- Mudou a estatística (kills, mortes, trades…): o ELO da liga também é refeito.
drop trigger if exists league_elo_records on public.player_match_records;
create constraint trigger league_elo_records
  after insert or delete or update of user_id, rp, calculate_elo, match_id, kills, deaths, assists, first_kills, adr, traded_deaths
  on public.player_match_records
  deferrable initially deferred
  for each row execute function public.league_elo_changed();

select public.recalc_mvps();
select public.recompute_league_elo(id) from public.communities;
