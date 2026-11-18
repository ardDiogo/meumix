-- MeuMix — RP do MeuMix (parte 2: liga a regra e recalcula o ELO de todas as ligas)
-- Executar depois de 0056 (e depois de conferir a prévia). Pode ser executado mais de uma vez.
--
-- • O ELO de cada liga passa a ser: ELO inicial (nível GC + ajuste do admin) + RP do MeuMix
--   de cada mix da liga, em ordem de data (ver 0056).
-- • O RP da GC continua gravado em player_match_records.rp, só como informação.
-- • Para voltar à regra antiga, rode de novo a função recompute_league_elo da 0047.

create or replace function public.recompute_league_elo(p_league uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_league is null then return; end if;

  delete from public.league_elo_history where league_id = p_league;
  insert into public.league_elo_history
    (record_id, league_id, match_id, user_id, event_date, elo_before, elo_after, level_before, level_after,
     seq, rp, rp_result, rp_perf, pts, pts_avg, rp_gc)
  select c.record_id, p_league, c.match_id, c.user_id, c.event_date, c.elo_before, c.elo_after,
         public.level_for_elo(c.elo_before), public.level_for_elo(c.elo_after),
         c.seq, case when c.counted then c.rp end, c.rp_result, c.rp_perf, c.pts, c.pts_avg, c.rp_gc
  from public.league_elo_compute(p_league) c;

  -- ELO atual: o último de cada um; última variação: a do último mix que contou.
  insert into public.league_members (league_id, user_id, elo, level, last_elo_change)
  select p_league, l.user_id, l.elo_after, public.level_for_elo(l.elo_after),
         (select h2.elo_after - h2.elo_before from public.league_elo_history h2
           where h2.league_id = p_league and h2.user_id = l.user_id and h2.rp is not null
           order by h2.seq desc limit 1)
  from (
    select distinct on (h.user_id) h.user_id, h.elo_after
    from public.league_elo_history h where h.league_id = p_league
    order by h.user_id, h.seq desc
  ) l
  on conflict (league_id, user_id) do update
    set elo = excluded.elo, level = excluded.level, last_elo_change = excluded.last_elo_change;

  -- Membro sem mixes na liga volta ao ELO inicial (+ ajuste).
  update public.league_members lm
  set elo = least(greatest(public.initial_elo_from_gc(pr.gc_level) + lm.elo_offset, 0), 1600),
      level = public.level_for_elo(least(greatest(public.initial_elo_from_gc(pr.gc_level) + lm.elo_offset, 0), 1600)),
      last_elo_change = null
  from public.profiles pr
  where lm.league_id = p_league and pr.id = lm.user_id
    and not exists (select 1 from public.league_elo_history h where h.league_id = p_league and h.user_id = lm.user_id);
end;
$$;

revoke all on function public.recompute_league_elo(uuid) from public, anon, authenticated;
grant execute on function public.recompute_league_elo(uuid) to service_role;

-- Recalcula todas as ligas desde o primeiro mix.
select public.recompute_league_elo(id) from public.communities;
