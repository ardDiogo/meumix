-- MeuMix — insígnias automáticas com os dados importados da GC
-- Executar depois de 0035 (que guarda os dados da GC). Pode ser executado mais de uma vez.
-- Calculadas pelos mixes importados pelo botão da GC (src/lib/badge-engine.ts):
--   * Ace, Clutch Master e Rei da Virada (permanentes);
--   * Abre-Alas, Cabeçudo e Mão de Alface (do momento: últimos 5 mixes importados).

alter table public.badges drop constraint if exists badges_auto_rule_check;
alter table public.badges add constraint badges_auto_rule_check check (
  auto_rule is null or auto_rule in (
    'win_streak', 'loss_streak', 'ranking_leader', 'latest_mvp', 'rank_climber', 'consistent', 'map_king', 'veteran',
    'latest_lanterna', 'lanterna_streak',
    'latest_top_kills', 'latest_top_adr', 'latest_top_kdr', 'latest_top_fk', 'latest_top_assists', 'latest_top_deaths',
    'latest_low_fk',
    'bolao_leader', 'bolao_spectator', 'bolao_perfect', 'bolao_miss_streak', 'bolao_zero',
    'gc_ace', 'gc_clutch_master', 'gc_comeback', 'gc_entry_top', 'gc_hs_top', 'gc_hs_low'
  )
);

insert into public.badges (name, description, unlock_rule, deactivation_rule, icon, color, kind, auto_rule, params) values
  ('Ace', 'Cinco na conta, sozinho, num round só. Limpou o servidor.',
   'Fazer um ace (5 kills num round) num mix importado da GC.',
   'Permanente.', 'img:ace', '#F43F5E', 'permanent', 'gc_ace', '{}'),
  ('Clutch Master', 'Ficou sozinho contra três e voltou pra contar a história.',
   'Vencer um clutch 1v3 ou maior num mix importado da GC.',
   'Permanente.', 'img:clutch', '#D946EF', 'permanent', 'gc_clutch_master', '{"min_vs": 3}'),
  ('Rei da Virada', 'Estava perdendo feio. Estava.',
   'Estar no time que virou um mapa perdendo por 7 ou mais rounds (ex.: 2×10 → 16×14).',
   'Permanente.', 'img:virada', '#3B82F6', 'permanent', 'gc_comeback', '{"deficit": 7}'),
  ('Abre-Alas', 'Primeiro a entrar, primeiro a matar. O bomb site é dele.',
   'Ter mais aberturas vencidas nos últimos 5 mixes importados da GC (mínimo de 10 duelos de abertura).',
   'Passa para quem abrir mais rounds.', 'img:abrealas', '#F97316', 'dynamic', 'gc_entry_top',
   '{"window": 5, "min_duels": 10}'),
  ('Cabeçudo', 'Só mira na cabeça. O resto do corpo é decoração.',
   'Ter o maior HS% nos últimos 5 mixes importados da GC (mínimo de 30 kills).',
   'Passa para quem tiver o maior HS%.', 'img:cabecudo', '#EF4444', 'dynamic', 'gc_hs_top',
   '{"window": 5, "min_kills": 30}'),
  ('Mão de Alface', 'A mira passa perto da cabeça. Perto.',
   'Ter o pior HS% nos últimos 5 mixes importados da GC (mínimo de 30 kills).',
   'Passa para quem tiver o pior HS%.', 'img:alface', '#84CC16', 'dynamic', 'gc_hs_low',
   '{"window": 5, "min_kills": 30}')
on conflict do nothing;
