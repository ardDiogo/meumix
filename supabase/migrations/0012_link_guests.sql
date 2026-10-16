-- MeuMix — vincular convidados de uma partida já finalizada a contas
-- Executar depois de 0011. Pode ser executado mais de uma vez.

-- Liga um registro de convidado (user_id nulo) a um jogador. Com p_apply_elo,
-- aplica o RP daquela partida ao ELO atual do jogador e registra no histórico.
-- Os totais do perfil são recalculados pelo trigger de player_match_records.
create or replace function public.link_match_record(
  p_record uuid,
  p_user uuid,
  p_by uuid,
  p_apply_elo boolean default true
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rec public.player_match_records%rowtype;
  v_old int;
  v_new int;
begin
  select * into v_rec from public.player_match_records where id = p_record for update;
  if not found then raise exception 'RECORD_NOT_FOUND'; end if;
  if v_rec.user_id is not null then raise exception 'ALREADY_LINKED'; end if;
  if exists (
    select 1 from public.player_match_records where match_id = v_rec.match_id and user_id = p_user
  ) then
    raise exception 'USER_ALREADY_IN_MATCH';
  end if;

  select elo into v_old from public.profiles where id = p_user for update;
  if not found then raise exception 'USER_NOT_FOUND'; end if;
  v_new := case when p_apply_elo then least(greatest(v_old + v_rec.rp, 0), 1600) else v_old end;

  update public.player_match_records set
    user_id = p_user,
    calculate_elo = p_apply_elo,
    elo_before = v_old,
    elo_after = v_new,
    level_before = public.level_for_elo(v_old),
    level_after = public.level_for_elo(v_new)
  where id = p_record;

  if p_apply_elo and v_new <> v_old then
    update public.profiles
    set elo = v_new, level = public.level_for_elo(v_new), last_elo_change = v_new - v_old
    where id = p_user;
    insert into public.elo_change_logs (user_id, match_id, old_elo, new_elo, old_level, new_level, reason, changed_by)
    values (p_user, v_rec.match_id, v_old, v_new, public.level_for_elo(v_old), public.level_for_elo(v_new),
            'mix (vínculo de convidado)', p_by);
  end if;
end;
$$;

revoke all on function public.link_match_record(uuid, uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.link_match_record(uuid, uuid, uuid, boolean) to service_role;
