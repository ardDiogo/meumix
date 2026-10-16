-- MeuMix — excluir um mix finalizado desfazendo o ELO que ele aplicou
-- Executar depois de 0015. Pode ser executado mais de uma vez.

create or replace function public.delete_match(p_match uuid, p_by uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_old int;
  v_new int;
  v_count int := 0;
begin
  if not exists (select 1 from public.mix_matches where id = p_match) then
    raise exception 'MATCH_NOT_FOUND';
  end if;

  -- Desfaz a variação de ELO de cada jogador (sobre o ELO atual, que pode ter mudado depois).
  for r in
    select user_id, elo_before, elo_after
    from public.player_match_records
    where match_id = p_match and user_id is not null and calculate_elo
      and elo_before is not null and elo_after is not null and elo_after <> elo_before
  loop
    select elo into v_old from public.profiles where id = r.user_id for update;
    if not found then continue; end if;
    v_new := least(greatest(v_old - (r.elo_after - r.elo_before), 0), 1600);
    update public.profiles
    set elo = v_new, level = public.level_for_elo(v_new), last_elo_change = v_new - v_old
    where id = r.user_id;
    v_count := v_count + 1;
  end loop;

  -- Some do histórico de ELO como se não tivesse acontecido.
  delete from public.elo_change_logs where match_id = p_match;
  -- Registros dos jogadores saem em cascata (o trigger recalcula os totais do perfil).
  delete from public.mix_matches where id = p_match;
  return v_count;
end;
$$;

revoke all on function public.delete_match(uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_match(uuid, uuid) to service_role;
