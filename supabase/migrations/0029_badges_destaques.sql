-- MeuMix — insígnias automáticas dos destaques do último mix
-- Executar depois de 0028. Pode ser executado mais de uma vez.
-- Mesmos critérios dos cards "Destaques da partida" (src/lib/match-highlights.ts).
--   * novas: Maior Matador, Maior ADR, Maior KDR, Mais First Kills, Mais Assistências, Mais Mortes;
--   * Baiter (já existia, manual): passa a ser de quem teve menos first kills no último mix.

alter table public.badges drop constraint if exists badges_auto_rule_check;
alter table public.badges add constraint badges_auto_rule_check check (
  auto_rule is null or auto_rule in (
    'win_streak', 'loss_streak', 'ranking_leader', 'latest_mvp', 'rank_climber', 'consistent', 'map_king', 'veteran',
    'latest_lanterna', 'lanterna_streak',
    'latest_top_kills', 'latest_top_adr', 'latest_top_kdr', 'latest_top_fk', 'latest_top_assists', 'latest_top_deaths',
    'latest_low_fk'
  )
);

insert into public.badges (name, description, unlock_rule, deactivation_rule, icon, color, kind, auto_rule, params) values
  ('Maior Matador', 'Ninguém matou mais no último mix.', 'Ter mais kills no mix mais recente.',
   'Passa para quem tiver mais kills no próximo mix.', 'img:matador', '#EAB308', 'dynamic', 'latest_top_kills', '{}'),
  ('Maior ADR', 'Dano pra todo lado.', 'Ter o maior ADR no mix mais recente.',
   'Passa para quem tiver o maior ADR no próximo mix.', 'img:adr', '#FF6A00', 'dynamic', 'latest_top_adr', '{}'),
  ('Maior KDR', 'Mata muito, morre pouco.', 'Ter o maior KDR no mix mais recente.',
   'Passa para quem tiver o maior KDR no próximo mix.', 'img:kdr', '#22C55E', 'dynamic', 'latest_top_kdr', '{}'),
  ('Mais First Kills', 'Abre o round antes de todo mundo.', 'Ter mais first kills no mix mais recente.',
   'Passa para quem tiver mais first kills no próximo mix.', 'img:firstkill', '#06B6D4', 'dynamic', 'latest_top_fk', '{}'),
  ('Mais Assistências', 'Joga para o time.', 'Ter mais assistências no mix mais recente.',
   'Passa para quem tiver mais assistências no próximo mix.', 'img:assistencia', '#3B82F6', 'dynamic', 'latest_top_assists', '{}'),
  ('Mais Mortes', 'Respawn favorito do servidor.', 'Morrer mais vezes no mix mais recente.',
   'Passa para quem morrer mais no próximo mix.', 'img:mortes', '#EF4444', 'dynamic', 'latest_top_deaths', '{}')
on conflict do nothing;

update public.badges set kind = 'dynamic', auto_rule = 'latest_low_fk', params = '{}',
  unlock_rule = 'Ter menos first kills no mix mais recente.',
  deactivation_rule = 'Passa para quem tiver menos first kills no próximo mix.'
  where lower(name) = 'baiter' and auto_rule is null;

-- Concessões manuais antigas da Baiter vão para o histórico (só as de antes desta versão).
update public.player_badges pb
   set deactivated_at = now(), end_reason = 'A insígnia passou a ser automática.'
  from public.badges b
 where b.id = pb.badge_id and b.auto_rule = 'latest_low_fk' and pb.source = 'manual' and pb.deactivated_at is null
   and pb.created_at < timestamptz '2026-10-20 12:00:00+00';
