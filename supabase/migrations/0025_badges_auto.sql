-- MeuMix — insígnias automáticas (dinâmicas e permanentes) com histórico
-- Executar depois de 0024. Pode ser executado mais de uma vez.
--
-- O cálculo é feito no servidor (src/lib/badge-engine.ts) a partir dos resultados
-- oficiais (mix_matches + player_match_records). Esta migração só guarda:
--   * em badges: tipo, regra automática, parâmetros e se está habilitada;
--   * em player_badges: cada conquista é uma linha, com início, fim e motivos
--     (o histórico é preservado: desativar = preencher deactivated_at);
--   * badge_progress: progresso atual (ex.: 2/3 vitórias seguidas).

-- ---------------------------------------------------------------- badges
alter table public.badges add column if not exists kind text not null default 'permanent';
alter table public.badges add column if not exists auto_rule text;
alter table public.badges add column if not exists params jsonb not null default '{}'::jsonb;
alter table public.badges add column if not exists deactivation_rule text;
alter table public.badges add column if not exists enabled boolean not null default true;

alter table public.badges drop constraint if exists badges_kind_check;
alter table public.badges add constraint badges_kind_check check (kind in ('permanent', 'dynamic'));
alter table public.badges drop constraint if exists badges_auto_rule_check;
alter table public.badges add constraint badges_auto_rule_check check (
  auto_rule is null or auto_rule in (
    'win_streak', 'loss_streak', 'ranking_leader', 'latest_mvp', 'rank_climber', 'consistent', 'map_king', 'veteran'
  )
);
alter table public.badges drop constraint if exists badges_deactivation_rule_check;
alter table public.badges add constraint badges_deactivation_rule_check check (char_length(deactivation_rule) <= 200);
create unique index if not exists badges_auto_rule_key on public.badges (auto_rule) where auto_rule is not null;

-- --------------------------------------------------------- player_badges
alter table public.player_badges add column if not exists source text not null default 'manual';
alter table public.player_badges add column if not exists source_ref text not null default 'manual';
alter table public.player_badges add column if not exists scope text not null default '';
alter table public.player_badges add column if not exists reason text;
alter table public.player_badges add column if not exists deactivated_at timestamptz;
alter table public.player_badges add column if not exists end_reason text;
-- Desativada à mão pelo admin: o recálculo automático não mexe nela.
alter table public.player_badges add column if not exists locked boolean not null default false;

alter table public.player_badges drop constraint if exists player_badges_source_check;
alter table public.player_badges add constraint player_badges_source_check check (source in ('manual', 'auto'));
alter table public.player_badges drop constraint if exists player_badges_reason_check;
alter table public.player_badges add constraint player_badges_reason_check
  check (char_length(reason) <= 200 and char_length(end_reason) <= 200);

-- Antes: uma linha por jogador/insígnia. Agora: uma linha por conquista
-- (manual = source_ref 'manual'; automática = identificador estável da conquista).
alter table public.player_badges drop constraint if exists player_badges_user_id_badge_id_key;
alter table public.player_badges drop constraint if exists player_badges_user_badge_ref_key;
alter table public.player_badges add constraint player_badges_user_badge_ref_key unique (user_id, badge_id, source_ref);
create index if not exists player_badges_active_idx on public.player_badges (user_id) where deactivated_at is null;

-- --------------------------------------------------------- badge_progress
create table if not exists public.badge_progress (
  user_id uuid not null references public.profiles (id) on delete cascade,
  badge_id uuid not null references public.badges (id) on delete cascade,
  current int not null check (current >= 0),
  target int not null check (target > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, badge_id)
);
alter table public.badge_progress enable row level security;
drop policy if exists "leitura publica" on public.badge_progress;
create policy "leitura publica" on public.badge_progress for select using (true);
revoke insert, update, delete on public.badge_progress from anon, authenticated;

-- -------------------------------------------- insígnias automáticas (catálogo)
-- Existentes: só ganham a regra (nome, descrição e imagem continuam iguais).
update public.badges set kind = 'dynamic', auto_rule = 'loss_streak', params = '{"n": 3}',
  unlock_rule = 'Perder 3 mapas seguidos.',
  deactivation_rule = 'Sai na primeira vitória em mapa.'
  where lower(name) = 'pé frio' and auto_rule is null;
update public.badges set kind = 'dynamic', auto_rule = 'rank_climber', params = '{"positions": 5, "window": 4}',
  unlock_rule = 'Subir 5 ou mais posições no ranking em relação a 4 mixes atrás.',
  deactivation_rule = 'Sai quando a subida nos últimos 4 mixes fica abaixo de 5 posições.'
  where lower(name) = 'foguete' and auto_rule is null;
update public.badges set kind = 'dynamic', auto_rule = 'consistent', params = '{"mixes": 10, "min_rating": 0.9}',
  unlock_rule = 'Nota de desempenho (a mesma do perfil) de 0,90 ou mais em cada um dos últimos 10 mixes jogados.',
  deactivation_rule = 'Sai quando um dos últimos 10 mixes fica abaixo de 0,90.'
  where lower(name) = 'consistente' and auto_rule is null;
update public.badges set kind = 'dynamic', auto_rule = 'map_king', params = '{"min_maps": 5, "min_win_rate": 60}',
  unlock_rule = 'Melhor aproveitamento em um mapa (mínimo de 5 partidas nele e 60% de vitórias).',
  deactivation_rule = 'Sai quando outro jogador passa a ter o melhor aproveitamento naquele mapa.'
  where lower(name) = 'rei do mapa' and auto_rule is null;
update public.badges set kind = 'permanent', auto_rule = 'veteran', params = '{"mixes": 50}',
  unlock_rule = 'Participar de 50 mixes concluídos.'
  where lower(name) = 'veterano de guerra' and auto_rule is null;

-- Novas.
insert into public.badges (name, description, unlock_rule, deactivation_rule, icon, color, kind, auto_rule, params) values
  ('Foguinho', 'Tá on fire: não para de ganhar.', 'Vencer 3 mapas seguidos.',
   'Sai na primeira derrota em mapa.', 'img:foguinho', '#FF6A00', 'dynamic', 'win_streak', '{"n": 3}'),
  ('Rei do Mix', 'O dono do topo do ranking.', 'Ser o 1º do ranking geral (ELO), com pelo menos 3 mixes jogados.',
   'Sai quando outro jogador assume a liderança.', 'img:rei', '#EAB308', 'dynamic', 'ranking_leader', '{"min_mixes": 3}'),
  ('MVP', 'O melhor jogador do último mix.', 'Ser o MVP do mix mais recente.',
   'Sai quando o próximo mix é finalizado com outro MVP.', 'img:mvp', '#EAB308', 'dynamic', 'latest_mvp', '{}')
on conflict do nothing;

-- Quem tinha recebido à mão uma insígnia que virou automática: a conquista
-- manual vai para o histórico (o cálculo automático decide quem tem agora).
update public.player_badges pb
   set deactivated_at = now(), end_reason = 'A insígnia passou a ser automática.'
  from public.badges b
 where b.id = pb.badge_id and b.auto_rule is not null and pb.source = 'manual' and pb.deactivated_at is null
   -- Só as concessões de antes desta versão (rodar de novo não mexe nas feitas depois).
   and pb.created_at < timestamptz '2026-10-20 03:00:00+00';

-- ------------------------------------------------ sincronização (servidor)
-- Recebe o resultado completo do cálculo e aplica numa única transação:
--   * insere conquistas novas (sem duplicar: unique user/badge/source_ref);
--   * atualiza fim/motivo das existentes (desativar = preencher deactivated_at);
--   * conquistas dinâmicas que deixaram de existir após correção de resultado
--     são apagadas; permanentes nunca são removidas;
--   * substitui o progresso das regras calculadas.
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
  insert into public.badge_progress (user_id, badge_id, current, target)
  select x.user_id, x.badge_id, x.current, x.target
    from jsonb_to_recordset(coalesce(p_progress, '[]'::jsonb)) as x(user_id uuid, badge_id uuid, current int, target int)
   where exists (select 1 from public.profiles p where p.id = x.user_id)
  on conflict (user_id, badge_id) do update set current = excluded.current, target = excluded.target, updated_at = now();

  return jsonb_build_object('inseridas', v_inserted, 'atualizadas', v_updated, 'removidas', v_removed);
end;
$$;

revoke all on function public.sync_auto_badges(uuid[], jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.sync_auto_badges(uuid[], jsonb, jsonb) to service_role;
