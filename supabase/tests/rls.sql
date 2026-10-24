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
select pg_temp.expect_denied('S-01 visitante lê palpites do bolão', 'select * from public.mix_predictions', 'anon');
select pg_temp.expect_denied('S-01 jogador lê palpites do bolão (escondidos até fechar)', 'select * from public.mix_predictions', 'authenticated', '00000000-0000-4000-8000-000000000001');
select pg_temp.expect_denied('S-01 jogador lê inscrições de push', 'select * from public.push_subscriptions', 'authenticated', '00000000-0000-4000-8000-000000000001');
select pg_temp.expect_denied('S-01 visitante lê push_log', 'select * from public.push_log', 'anon');
select pg_temp.expect_denied('S-05 jogador palpita direto pela API', $q$insert into public.mix_predictions (schedule_id, event_date, user_id, winner_captain, maps_won, maps_lost) select id, current_date, '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 2, 1 from public.mix_schedules limit 1$q$, 'authenticated', '00000000-0000-4000-8000-000000000001');
select pg_temp.expect_denied('S-05 jogador cadastra aparelho de outro', $q$insert into public.push_subscriptions (endpoint, user_id, p256dh, auth) values ('https://push.example/abc', '00000000-0000-4000-8000-000000000002', 'x', 'y')$q$, 'authenticated', '00000000-0000-4000-8000-000000000001');
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
select pg_temp.expect_denied('S-05b jogador chama anonymize_account', $q$select public.anonymize_account('00000000-0000-4000-8000-000000000002')$q$, 'authenticated', '00000000-0000-4000-8000-000000000001');
select pg_temp.expect_denied('S-05b visitante chama purge_audit_log', 'select public.purge_audit_log()', 'anon');
select pg_temp.expect_denied('S-05b jogador chama sync_auto_badges', $q$select public.sync_auto_badges(array[]::uuid[], '[]', '[]')$q$, 'authenticated', '00000000-0000-4000-8000-000000000001');
select pg_temp.expect_denied('S-05 jogador concede insígnia automática direto', $q$insert into public.player_badges (user_id, badge_id, source, source_ref) select '00000000-0000-4000-8000-000000000001', id, 'auto', 'x' from public.badges where auto_rule = 'win_streak'$q$, 'authenticated', '00000000-0000-4000-8000-000000000001');
select pg_temp.expect_denied('S-05 jogador escreve progresso', $q$insert into public.badge_progress (user_id, badge_id, current, target) select '00000000-0000-4000-8000-000000000001', id, 3, 3 from public.badges where auto_rule = 'win_streak'$q$, 'authenticated', '00000000-0000-4000-8000-000000000001');
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

-- S-06: exclusão de conta (como o servidor faz: anonimiza e depois apaga no Auth)
begin;
insert into public.mix_matches (id, event_date, platform) values ('11111111-1111-4111-8111-111111111111', current_date, 'manual');
insert into public.player_match_records (match_id, user_id, player_name, team) values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-000000000001', 'Jogador', 'A'),
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-000000000002', 'Outro', 'B');
insert into public.audit_log (action, outcome, actor_id, detail) values
  ('admin.user_edit', 'success', '00000000-0000-4000-8000-000000000002', '{"userId":"00000000-0000-4000-8000-000000000001","nick":"Jogador"}');
select public.anonymize_account('00000000-0000-4000-8000-000000000001');
delete from auth.users where id = '00000000-0000-4000-8000-000000000001';
do $$
begin
  if exists (select 1 from public.profiles where id = '00000000-0000-4000-8000-000000000001') then
    raise exception 'FALHOU S-06: perfil continua existindo';
  end if;
  if exists (select 1 from public.confirm_links where user_id = '00000000-0000-4000-8000-000000000001')
     or exists (select 1 from public.user_penalties where user_id = '00000000-0000-4000-8000-000000000001') then
    raise exception 'FALHOU S-06: link pessoal ou penalidade não foram apagados';
  end if;
  if (select player_name from public.player_match_records where team = 'A') <> 'Jogador removido'
     or (select user_id from public.player_match_records where team = 'A') is not null then
    raise exception 'FALHOU S-06: placar não foi anonimizado';
  end if;
  if (select player_name from public.player_match_records where team = 'B') <> 'Outro' then
    raise exception 'FALHOU S-06: placar de outro jogador foi alterado';
  end if;
  if exists (select 1 from public.audit_log where detail::text ~ '203\.0\.113\.7|"nick"') then
    raise exception 'FALHOU S-06: IP ou nick do titular continuam no log';
  end if;
  raise notice 'ok  S-06 exclusão: perfil e dados apagados, placar anonimizado, log sem IP/nick';
end $$;
rollback;

-- Insígnias automáticas: sincronização (src/services/badge-sync.ts → sync_auto_badges)
begin;
do $$
declare
  fog uuid := (select id from public.badges where auto_rule = 'win_streak');
  vet uuid := (select id from public.badges where auto_rule = 'veteran');
  manual uuid := (select id from public.badges where auto_rule is null limit 1);
  u1 uuid := '00000000-0000-4000-8000-000000000001';
  rows1 jsonb;
  n int;
  r jsonb;
begin
  if fog is null or vet is null or manual is null then raise exception 'FALHOU: catálogo de insígnias automáticas ausente'; end if;
  insert into public.player_badges (user_id, badge_id) values (u1, manual);  -- manual, como antes da 0025

  rows1 := jsonb_build_array(
    jsonb_build_object('user_id', u1, 'badge_id', fog, 'source_ref', 'win_streak::m1:3', 'scope', '',
      'activated_at', '2026-09-01T23:00:00Z', 'deactivated_at', null, 'reason', '3 vitórias seguidas', 'end_reason', null),
    jsonb_build_object('user_id', u1, 'badge_id', vet, 'source_ref', 'veteran::marco', 'scope', '',
      'activated_at', '2026-09-01T23:00:00Z', 'deactivated_at', null, 'reason', '50 mixes', 'end_reason', null));
  perform public.sync_auto_badges(array[fog, vet], rows1,
    jsonb_build_array(jsonb_build_object('user_id', u1, 'badge_id', fog, 'current', 3, 'target', 3)));
  r := public.sync_auto_badges(array[fog, vet], rows1, '[]');
  select count(*) into n from public.player_badges where user_id = u1 and badge_id in (fog, vet);
  if n <> 2 or (r ->> 'inseridas')::int <> 0 then raise exception 'FALHOU: reprocessar duplicou (% linhas, %)', n, r; end if;
  raise notice 'ok  insígnias: reprocessar os mesmos dados não duplica';

  -- Derrota: a mesma conquista volta encerrada; a linha continua (histórico).
  perform public.sync_auto_badges(array[fog, vet], jsonb_build_array(
    jsonb_set(jsonb_set(rows1 -> 0, '{deactivated_at}', '"2026-09-02T23:00:00Z"'), '{end_reason}', '"derrota"'),
    rows1 -> 1), '[]');
  if not exists (select 1 from public.player_badges where user_id = u1 and badge_id = fog and deactivated_at is not null and end_reason = 'derrota') then
    raise exception 'FALHOU: desativar apagou ou não encerrou a conquista';
  end if;
  raise notice 'ok  insígnias: desativar mantém o histórico';

  -- Nova sequência: segunda conquista, a primeira continua no histórico.
  perform public.sync_auto_badges(array[fog, vet], jsonb_build_array(
    jsonb_set(jsonb_set(rows1 -> 0, '{deactivated_at}', '"2026-09-02T23:00:00Z"'), '{end_reason}', '"derrota"'),
    jsonb_set(rows1 -> 0, '{source_ref}', '"win_streak::m3:3"'),
    rows1 -> 1), '[]');
  select count(*) into n from public.player_badges where user_id = u1 and badge_id = fog;
  if n <> 2 then raise exception 'FALHOU: reconquista deveria ter 2 linhas, tem %', n; end if;
  raise notice 'ok  insígnias: reconquistar cria nova conquista e preserva a anterior';

  -- Admin desativa a conquista do jogador (travada): o recálculo não reativa nem apaga.
  update public.player_badges set deactivated_at = now(), end_reason = 'Desativada pelo admin', locked = true
   where user_id = u1 and badge_id = fog and source_ref = 'win_streak::m3:3';
  perform public.sync_auto_badges(array[fog, vet], jsonb_build_array(
    jsonb_set(rows1 -> 0, '{source_ref}', '"win_streak::m3:3"'), rows1 -> 1), '[]');
  if not exists (select 1 from public.player_badges where source_ref = 'win_streak::m3:3' and locked and deactivated_at is not null) then
    raise exception 'FALHOU: recálculo reativou insígnia desativada pelo admin';
  end if;
  raise notice 'ok  insígnias: desativada pelo admin continua desativada após recálculo';

  -- Correção de resultado: nada derivado → dinâmicas somem; permanente e manual ficam.
  perform public.sync_auto_badges(array[fog, vet], '[]', '[]');
  if exists (select 1 from public.player_badges where badge_id = fog and not locked) then raise exception 'FALHOU: dinâmica inválida não foi removida'; end if;
  if not exists (select 1 from public.player_badges where badge_id = fog and locked) then raise exception 'FALHOU: travada foi apagada'; end if;
  if not exists (select 1 from public.player_badges where badge_id = vet and user_id = u1) then raise exception 'FALHOU: permanente foi removida'; end if;
  if not exists (select 1 from public.player_badges where badge_id = manual and user_id = u1) then raise exception 'FALHOU: manual foi mexida'; end if;
  if exists (select 1 from public.badge_progress where badge_id = fog) then raise exception 'FALHOU: progresso não foi substituído'; end if;
  raise notice 'ok  insígnias: correção recalcula dinâmicas; permanentes e manuais ficam';
end $$;
rollback;

-- P-02: retenção do log
begin;
insert into public.audit_log (action, outcome, detail, created_at) values
  ('registration.join', 'success', '{"ip":"198.51.100.1","user_agent":"x","via":"session"}', now() - interval '7 months'),
  ('registration.join', 'success', '{"ip":"198.51.100.2","user_agent":"y"}', now() - interval '1 month'),
  ('admin.old', 'success', '{}', now() - interval '25 months');
select public.purge_audit_log();
do $$
begin
  if exists (select 1 from public.audit_log where detail ->> 'ip' = '198.51.100.1') then
    raise exception 'FALHOU P-02: IP com mais de 6 meses continua no log';
  end if;
  if not exists (select 1 from public.audit_log where detail ->> 'ip' = '198.51.100.2') then
    raise exception 'FALHOU P-02: IP recente foi apagado cedo demais';
  end if;
  if exists (select 1 from public.audit_log where action = 'admin.old') then
    raise exception 'FALHOU P-02: evento com mais de 24 meses não foi apagado';
  end if;
  raise notice 'ok  P-02 retenção: IP > 6 meses removido, evento > 24 meses apagado';
end $$;
rollback;
\echo 'Todos os testes de RLS passaram.'
