-- MeuMix — RP do MeuMix (parte 1: cálculo e prévia; NÃO muda o ELO de ninguém)
-- Executar depois de 0055. Pode ser executado mais de uma vez.
--
-- O ELO de cada liga deixa de somar o RP da GC (que pode vir congelado ou dobrado)
-- e passa a somar o RP do MeuMix, calculado só com o que aconteceu no mix:
--
--   RP = resultado + desempenho
--   resultado  = 20 × (S − E)   S = 1 vitória, 0,5 empate, 0 derrota (pelos mapas)
--                               E = chance de vitória pelo ELO médio dos times (Elo clássico)
--                               → times parelhos: +10 / −10
--   desempenho = 15 × (PTS − média da PTS do mix) ÷ média, limitado a −10…+10
--                PTS = K × 3 + A × 1,5 + FK × 1,2 + ADR × 0,2 − D × 2 (mix sem estatísticas: 0)
--
-- Esta parte só cria o cálculo e a prévia (league_elo_preview). A 0057 liga a regra
-- e recalcula o ELO de todas as ligas desde o primeiro mix.

alter table public.league_elo_history
  add column if not exists seq int,
  add column if not exists rp int,
  add column if not exists rp_result numeric(6, 2),
  add column if not exists rp_perf numeric(6, 2),
  add column if not exists pts numeric(7, 2),
  add column if not exists pts_avg numeric(7, 2),
  add column if not exists rp_gc int;

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
      avg(p.kills * 3 + p.assists * 1.5 + p.first_kills * 1.2 + coalesce(p.adr, 0) * 0.2 - p.deaths * 2),
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
             p.kills * 3 + p.assists * 1.5 + p.first_kills * 1.2 + coalesce(p.adr, 0) * 0.2 - p.deaths * 2 as score
      from public.player_match_records p
      where p.match_id = m.id and p.user_id is not null
        and exists (select 1 from public.profiles pr where pr.id = p.user_id)
      order by p.id
    loop
      v_cur := coalesce((v ->> r.user_id::text)::int, (v_initial ->> r.user_id::text)::int, 0);
      v_s := case when r.wins > r.losses then 1 when r.wins = r.losses then 0.5 else 0 end;
      v_e := case when r.team = 'A' then 1 / (1 + power(10, (v_avg_b - v_avg_a) / 400.0))
                  else 1 / (1 + power(10, (v_avg_a - v_avg_b) / 400.0)) end;
      v_res := round(20 * (v_s - v_e), 2);
      v_pts := r.score;
      v_perf := case when v_stats and v_pts_avg is not null
        then round(least(greatest(15 * (r.score - v_pts_avg) / greatest(abs(v_pts_avg), 1), -10), 10), 2)
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

-- Prévia: ELO de hoje × ELO com o RP do MeuMix, por liga (só lê).
create or replace function public.league_elo_preview()
returns table (liga text, jogador text, mixes bigint, elo_hoje int, elo_novo int, diferenca int, nivel_hoje smallint, nivel_novo smallint)
language sql
stable
security definer
set search_path = ''
as $$
  with c as (
    select l.id league_id, l.name, l.sort_order, x.*
    from public.communities l, lateral public.league_elo_compute(l.id) x
  ),
  last as (
    select distinct on (league_id, user_id) league_id, name, sort_order, user_id, elo_after
    from c order by league_id, user_id, seq desc
  ),
  n as (select league_id, user_id, count(distinct match_id) mixes from c group by 1, 2)
  select last.name, pr.display_name, n.mixes, lm.elo, last.elo_after, last.elo_after - lm.elo,
         lm.level, public.level_for_elo(last.elo_after)
  from last
  join n using (league_id, user_id)
  join public.profiles pr on pr.id = last.user_id
  left join public.league_members lm on lm.league_id = last.league_id and lm.user_id = last.user_id
  order by last.sort_order, last.elo_after desc;
$$;

revoke all on function public.league_elo_preview() from public, anon, authenticated;
grant execute on function public.league_elo_preview() to service_role;
