-- MeuMix — insígnias automáticas de lanterna
-- Executar depois de 0025. Pode ser executado mais de uma vez.
--   * Lanterna (já existia, manual): passa a ser do lanterna do último mix.
--   * Lanterna Vermelha (nova): lanterna em 3 mixes seguidos que o jogador jogou.

alter table public.badges drop constraint if exists badges_auto_rule_check;
alter table public.badges add constraint badges_auto_rule_check check (
  auto_rule is null or auto_rule in (
    'win_streak', 'loss_streak', 'ranking_leader', 'latest_mvp', 'rank_climber', 'consistent', 'map_king', 'veteran',
    'latest_lanterna', 'lanterna_streak'
  )
);

update public.badges set kind = 'dynamic', auto_rule = 'latest_lanterna', params = '{}',
  unlock_rule = 'Ser o lanterna (pior desempenho) do mix mais recente.',
  deactivation_rule = 'Passa para o lanterna do próximo mix.'
  where lower(name) = 'lanterna' and auto_rule is null;

insert into public.badges (name, description, unlock_rule, deactivation_rule, icon, color, kind, auto_rule, params) values
  ('Lanterna Vermelha', 'Alguém acende a luz pra ele, por favor.', 'Ser o lanterna em 3 mixes seguidos que jogou.',
   'Sai no primeiro mix em que não for o lanterna.', 'img:lanternavermelha', '#EF4444', 'dynamic', 'lanterna_streak', '{"n": 3}')
on conflict do nothing;

-- Concessões manuais antigas da Lanterna vão para o histórico (só as de antes desta versão).
update public.player_badges pb
   set deactivated_at = now(), end_reason = 'A insígnia passou a ser automática.'
  from public.badges b
 where b.id = pb.badge_id and b.auto_rule = 'latest_lanterna' and pb.source = 'manual' and pb.deactivated_at is null
   and pb.created_at < timestamptz '2026-10-20 06:00:00+00';
