-- MeuMix — insígnias dobradas no Mix do Jantinha
-- Executar depois de 0051. Pode ser executado mais de uma vez.
--
-- Fora da liga principal, a referência da conquista ganhou o prefixo da liga ("terca:…").
-- O recálculo não reconhecia a conquista antiga (sem prefixo) e gravava outra: as
-- insígnias permanentes (Clutch Master, Ace, Rei da Virada…) ficaram dobradas.
-- 1) Limpa as duplicadas: fica uma por conquista (a travada pelo admin, se houver).
-- 2) O recálculo passa a renomear a conquista antiga em vez de criar outra.

-- 1) Pares "X" e "<liga>:X" da mesma pessoa e insígnia na mesma liga.
--    a) Antiga travada pelo admin: apaga a nova (a travada fica).
delete from public.player_badges novo
using public.player_badges velho, public.communities c
where c.id = velho.league_id and c.slug <> 'principal'
  and velho.source = 'auto' and novo.source = 'auto' and velho.locked
  and novo.user_id = velho.user_id and novo.badge_id = velho.badge_id and novo.league_id = velho.league_id
  and novo.source_ref = c.slug || ':' || velho.source_ref;

--    b) Senão: apaga a antiga (a nova, com a referência da liga, fica).
delete from public.player_badges velho
using public.player_badges novo, public.communities c
where c.id = velho.league_id and c.slug <> 'principal'
  and velho.source = 'auto' and novo.source = 'auto' and not velho.locked
  and novo.user_id = velho.user_id and novo.badge_id = velho.badge_id and novo.league_id = velho.league_id
  and novo.source_ref = c.slug || ':' || velho.source_ref;

--    c) As travadas que ficaram ganham a referência da liga (o recálculo passa a reconhecê-las).
update public.player_badges velho
set source_ref = c.slug || ':' || velho.source_ref
from public.communities c
where c.id = velho.league_id and c.slug <> 'principal'
  and velho.source = 'auto' and velho.locked
  and velho.source_ref not like c.slug || ':%'
  and not exists (
    select 1 from public.player_badges t
    where t.user_id = velho.user_id and t.badge_id = velho.badge_id
      and t.source_ref = c.slug || ':' || velho.source_ref
  );

-- 2) Recálculo por liga reconhecendo a conquista antiga.
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

  -- Conquista gravada antes de a liga ter prefixo ("X" → "terca:X"): é a mesma, só ganha o
  -- prefixo (sem isso, as permanentes ficavam dobradas).
  with d as (
    select * from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as x(user_id uuid, badge_id uuid, source_ref text)
  )
  update public.player_badges pb
     set source_ref = d.source_ref
    from d, public.communities c
   where c.id = p_league
     and pb.league_id = p_league and pb.source = 'auto'
     and pb.user_id = d.user_id and pb.badge_id = d.badge_id
     and d.source_ref = c.slug || ':' || pb.source_ref
     and not exists (
       select 1 from public.player_badges t
        where t.user_id = d.user_id and t.badge_id = d.badge_id and t.source_ref = d.source_ref
     );

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
