-- MeuMix — estatísticas completas do placar (S, FA, MK, DROP) no resultado do mix
-- Executar depois de 0010. Pode ser executado mais de uma vez.

alter table public.player_match_records add column if not exists s int;
alter table public.player_match_records add column if not exists fa int not null default 0;
alter table public.player_match_records add column if not exists mk int not null default 0;
alter table public.player_match_records add column if not exists drop_count int not null default 0;

-- Finalização: igual à 0007, gravando também S, FA, MK e DROP.
-- p_players: [{ user_id, player_name, team, kills, deaths, assists, first_kills,
--               adr, kast, rp, s, fa, mk, drop, is_mvp, is_lanterna, calculate_elo }]
create or replace function public.finalize_mix(
  p_schedule uuid,
  p_date date,
  p_platform text,
  p_maps jsonb,
  p_players jsonb,
  p_by uuid,
  p_team_a text default null,
  p_team_b text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match uuid;
  v_wins_a int;
  v_wins_b int;
  v_player jsonb;
  v_user uuid;
  v_team text;
  v_old int;
  v_new int;
  v_rp int;
  v_calc boolean;
begin
  if jsonb_array_length(coalesce(p_maps, '[]')) = 0 then raise exception 'NO_MAPS'; end if;
  if jsonb_array_length(coalesce(p_players, '[]')) = 0 then raise exception 'NO_PLAYERS'; end if;

  insert into public.mix_matches (schedule_id, event_date, platform, maps, team_a_name, team_b_name, finalized_by, stats_calculated)
  values (p_schedule, p_date, p_platform, p_maps, p_team_a, p_team_b, p_by, true)
  returning id into v_match;

  select count(*) filter (where (m ->> 'score_a')::int > (m ->> 'score_b')::int),
         count(*) filter (where (m ->> 'score_b')::int > (m ->> 'score_a')::int)
  into v_wins_a, v_wins_b
  from jsonb_array_elements(p_maps) m;

  for v_player in select * from jsonb_array_elements(p_players) loop
    v_user := nullif(v_player ->> 'user_id', '')::uuid;
    v_team := v_player ->> 'team';
    v_rp := coalesce((v_player ->> 'rp')::int, 0);
    v_calc := coalesce((v_player ->> 'calculate_elo')::boolean, true) and v_user is not null;

    if v_user is not null then
      select elo into v_old from public.profiles where id = v_user for update;
    else
      v_old := null;
    end if;
    v_new := case when v_calc and v_old is not null then least(greatest(v_old + v_rp, 0), 1600) else v_old end;

    insert into public.player_match_records (
      match_id, user_id, player_name, team, kills, deaths, assists, first_kills, diff, adr, kast, rp,
      wins, losses, is_mvp, is_lanterna, calculate_elo, elo_before, elo_after, level_before, level_after,
      s, fa, mk, drop_count
    ) values (
      v_match, v_user, v_player ->> 'player_name', v_team,
      coalesce((v_player ->> 'kills')::int, 0), coalesce((v_player ->> 'deaths')::int, 0),
      coalesce((v_player ->> 'assists')::int, 0), coalesce((v_player ->> 'first_kills')::int, 0),
      coalesce((v_player ->> 'kills')::int, 0) - coalesce((v_player ->> 'deaths')::int, 0),
      nullif(v_player ->> 'adr', '')::numeric, nullif(v_player ->> 'kast', '')::numeric, v_rp,
      case when v_team = 'A' then v_wins_a else v_wins_b end,
      case when v_team = 'A' then v_wins_b else v_wins_a end,
      coalesce((v_player ->> 'is_mvp')::boolean, false), coalesce((v_player ->> 'is_lanterna')::boolean, false),
      v_calc, v_old, v_new,
      case when v_old is not null then public.level_for_elo(v_old) end,
      case when v_new is not null then public.level_for_elo(v_new) end,
      nullif(v_player ->> 's', '')::int, coalesce(nullif(v_player ->> 'fa', '')::int, 0),
      coalesce(nullif(v_player ->> 'mk', '')::int, 0), coalesce(nullif(v_player ->> 'drop', '')::int, 0)
    );

    if v_calc and v_old is not null then
      update public.profiles
      set elo = v_new, level = public.level_for_elo(v_new), last_elo_change = v_new - v_old
      where id = v_user;
      insert into public.elo_change_logs (user_id, match_id, old_elo, new_elo, old_level, new_level, reason, changed_by)
      values (v_user, v_match, v_old, v_new, public.level_for_elo(v_old), public.level_for_elo(v_new), 'mix', p_by);
    end if;
  end loop;

  return v_match;
end;
$$;

revoke execute on function public.finalize_mix(uuid, date, text, jsonb, jsonb, uuid, text, text) from public, anon, authenticated;
grant execute on function public.finalize_mix(uuid, date, text, jsonb, jsonb, uuid, text, text) to service_role;
