-- MeuMix — progresso de todas as insígnias automáticas, com texto do que falta
-- Executar depois de 0027. Pode ser executado mais de uma vez.

alter table public.badge_progress add column if not exists detail text;
alter table public.badge_progress drop constraint if exists badge_progress_detail_check;
alter table public.badge_progress add constraint badge_progress_detail_check check (char_length(detail) <= 120);

-- Mesma sincronização da 0025, agora gravando o texto do progresso.
create or replace function public.sync_auto_badges(p_badges uuid[], p_rows jsonb, p_progress jsonb)
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

  with d as (
    select * from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as x(user_id uuid, badge_id uuid, source_ref text)
  )
  delete from public.player_badges pb
   using public.badges b
   where b.id = pb.badge_id and pb.badge_id = any (p_badges) and pb.source = 'auto' and b.kind = 'dynamic' and not pb.locked
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
     and ((pb.deactivated_at is null) <> (d.deactivated_at is null)
          or pb.reason is distinct from d.reason
          or pb.end_reason is distinct from d.end_reason);
  get diagnostics v_updated = row_count;

  insert into public.player_badges (user_id, badge_id, source, source_ref, scope, reason, created_at, deactivated_at, end_reason)
  select x.user_id, x.badge_id, 'auto', x.source_ref, coalesce(x.scope, ''), x.reason, x.activated_at, x.deactivated_at, x.end_reason
    from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as x(
      user_id uuid, badge_id uuid, source_ref text, scope text,
      activated_at timestamptz, deactivated_at timestamptz, reason text, end_reason text
    )
   where exists (select 1 from public.profiles p where p.id = x.user_id)
  on conflict (user_id, badge_id, source_ref) do nothing;
  get diagnostics v_inserted = row_count;

  delete from public.badge_progress where badge_id = any (p_badges);
  insert into public.badge_progress (user_id, badge_id, current, target, detail)
  select x.user_id, x.badge_id, x.current, x.target, left(x.detail, 120)
    from jsonb_to_recordset(coalesce(p_progress, '[]'::jsonb)) as x(user_id uuid, badge_id uuid, current int, target int, detail text)
   where exists (select 1 from public.profiles p where p.id = x.user_id)
  on conflict (user_id, badge_id) do update
    set current = excluded.current, target = excluded.target, detail = excluded.detail, updated_at = now();

  return jsonb_build_object('inseridas', v_inserted, 'atualizadas', v_updated, 'removidas', v_removed);
end;
$$;

revoke all on function public.sync_auto_badges(uuid[], jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.sync_auto_badges(uuid[], jsonb, jsonb) to service_role;
