-- Testes de RLS e privilégios (docs/seguranca/04-plano-de-testes.md).
-- Cada caso deve falhar com permissão negada ou não afetar nenhuma linha.
\set ON_ERROR_STOP 1
\pset tuples_only on
\pset format unaligned

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000000001', 'jogador@teste.local', '{"display_name":"Jogador","full_name":"Nome Completo Secreto"}'),
  ('00000000-0000-4000-8000-000000000002', 'outro@teste.local', '{"display_name":"Outro"}');
update public.profiles set full_name = 'Nome Completo Secreto', elo = 1000 where id = '00000000-0000-4000-8000-000000000001';
-- Dados nas tabelas privadas: uma leitura liberada devolveria linhas e o teste falharia.
insert into public.audit_log (action, outcome, actor_id, detail)
  values ('teste', 'success', '00000000-0000-4000-8000-000000000001', '{"ip":"203.0.113.7"}');
insert into public.confirm_links (user_id, token) values ('00000000-0000-4000-8000-000000000001', 'tokenTesteSecreto_1234567890');
insert into public.user_penalties (user_id, delay_seconds, reason) values ('00000000-0000-4000-8000-000000000001', 60, 'teste');

create function pg_temp.expect_denied(label text, statement text, as_role text, uid uuid default null)
returns void language plpgsql as $$
declare n int;
begin
  perform set_config('request.jwt.claims', coalesce(json_build_object('sub', uid, 'role', as_role)::text, ''), true);
  execute format('set local role %I', as_role);
  begin
    execute statement;
    get diagnostics n = row_count;
    reset role;
    if n > 0 then raise exception 'FALHOU %: % linha(s) afetada(s)', label, n; end if;
  exception when insufficient_privilege then
    reset role;
  end;
  raise notice 'ok  %', label;
end $$;

create function pg_temp.expect_allowed(label text, statement text, as_role text)
returns void language plpgsql as $$
begin
  execute format('set local role %I', as_role);
  execute statement;
  reset role;
  raise notice 'ok  %', label;
end $$;

begin;
-- S-01: dados privados
select pg_temp.expect_denied('S-01 visitante lê audit_log', 'select * from public.audit_log', 'anon');
select pg_temp.expect_denied('S-01 visitante lê confirm_links', 'select * from public.confirm_links', 'anon');
select pg_temp.expect_denied('S-01 visitante lê user_penalties', 'select * from public.user_penalties', 'anon');
select pg_temp.expect_denied('S-01 jogador lê mix_draft_ppt_choices', 'select * from public.mix_draft_ppt_choices', 'authenticated', '00000000-0000-4000-8000-000000000001');
-- S-01b: nome completo fora da API (P-01)
select pg_temp.expect_denied('S-01b visitante lê profiles.full_name', 'select full_name from public.profiles', 'anon');
select pg_temp.expect_denied('S-01b jogador lê o próprio full_name pela API', 'select full_name from public.profiles', 'authenticated', '00000000-0000-4000-8000-000000000001');
select pg_temp.expect_denied('S-01b visitante faz select * em profiles', 'select * from public.profiles', 'anon');
select pg_temp.expect_allowed('S-01b visitante lê nick e ELO', 'select id, display_name, elo, steam_id, twitch_login from public.profiles', 'anon');
-- S-02 / S-02c: ELO e papel
select pg_temp.expect_denied('S-02b jogador muda ELO de outro', $q$update public.profiles set elo = 5000 where id = '00000000-0000-4000-8000-000000000002'$q$, 'authenticated', '00000000-0000-4000-8000-000000000001');
select pg_temp.expect_denied('S-02c jogador muda o próprio ELO', $q$update public.profiles set elo = 5000 where id = '00000000-0000-4000-8000-000000000001'$q$, 'authenticated', '00000000-0000-4000-8000-000000000001');
select pg_temp.expect_denied('S-02c jogador vira admin', $q$update public.profiles set role = 'admin' where id = '00000000-0000-4000-8000-000000000001'$q$, 'authenticated', '00000000-0000-4000-8000-000000000001');
-- S-05c: nick só pelo servidor (P-13)
select pg_temp.expect_denied('S-05c jogador muda o próprio nick pela API', $q$update public.profiles set display_name = repeat('x', 500) where id = '00000000-0000-4000-8000-000000000001'$q$, 'authenticated', '00000000-0000-4000-8000-000000000001');
-- S-05: escrita direta
select pg_temp.expect_denied('S-05 jogador insere partida', $q$insert into public.mix_matches (event_date) values (current_date)$q$, 'authenticated', '00000000-0000-4000-8000-000000000001');
select pg_temp.expect_denied('S-05 jogador insere log de ELO', $q$insert into public.elo_change_logs (user_id, old_elo, new_elo) values ('00000000-0000-4000-8000-000000000001', 0, 5000)$q$, 'authenticated', '00000000-0000-4000-8000-000000000001');
select pg_temp.expect_denied('S-05 jogador insere clipe', $q$insert into public.clips (user_id, clip_id, title) values ('00000000-0000-4000-8000-000000000001', 'abcdef123', 'x')$q$, 'authenticated', '00000000-0000-4000-8000-000000000001');
select pg_temp.expect_denied('S-05 jogador se inscreve direto', $q$insert into public.mix_registrations (schedule_id, event_date, user_id) select id, current_date, '00000000-0000-4000-8000-000000000001' from public.mix_schedules limit 1$q$, 'authenticated', '00000000-0000-4000-8000-000000000001');
select pg_temp.expect_denied('S-05 jogador concede insígnia', $q$insert into public.player_badges (user_id, badge_id) select '00000000-0000-4000-8000-000000000001', id from public.badges limit 1$q$, 'authenticated', '00000000-0000-4000-8000-000000000001');
select pg_temp.expect_denied('S-05 jogador apaga partidas', 'delete from public.mix_matches', 'authenticated', '00000000-0000-4000-8000-000000000001');
-- S-05b: funções privilegiadas
select pg_temp.expect_denied('S-05b jogador chama delete_match', $q$select public.delete_match(gen_random_uuid(), '00000000-0000-4000-8000-000000000001')$q$, 'authenticated', '00000000-0000-4000-8000-000000000001');
select pg_temp.expect_denied('S-05b jogador chama save_level_configs', $q$select public.save_level_configs('[]'::jsonb)$q$, 'authenticated', '00000000-0000-4000-8000-000000000001');
select pg_temp.expect_denied('S-05b jogador chama draft_start', $q$select public.draft_start(gen_random_uuid(), current_date)$q$, 'authenticated', '00000000-0000-4000-8000-000000000001');
-- Toda tabela de public com RLS ligado
do $$
declare t text;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity loop
    raise exception 'FALHOU: tabela public.% sem RLS', t;
  end loop;
  raise notice 'ok  RLS ligado em todas as tabelas';
end $$;
-- Nenhuma política de escrita aberta para anon/authenticated
do $$
declare p record;
begin
  for p in select tablename, policyname, cmd from pg_policies
            where schemaname = 'public' and cmd <> 'SELECT' and roles && array['anon','authenticated','public']::name[] loop
    raise exception 'FALHOU: política de escrita % em %', p.policyname, p.tablename;
  end loop;
  raise notice 'ok  nenhuma política de escrita para anon/authenticated';
end $$;
rollback;
\echo 'Todos os testes de RLS passaram.'
