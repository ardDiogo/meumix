-- MeuMix — insígnias automáticas do bolão
-- Executar depois de 0032 (e da 0031, que cria o bolão). Pode ser executado mais de uma vez.
-- Calculadas pelos palpites conferidos com o resultado oficial (src/lib/badge-engine.ts):
--   * Rei do Pitaco (1º do bolão), Alambrado do Mix (palpita sem jogar), Mãe Diná (gabaritou),
--     Zicado (erra o vencedor seguido) e Chutômetro Quebrado (zerou o último bolão).

alter table public.badges drop constraint if exists badges_auto_rule_check;
alter table public.badges add constraint badges_auto_rule_check check (
  auto_rule is null or auto_rule in (
    'win_streak', 'loss_streak', 'ranking_leader', 'latest_mvp', 'rank_climber', 'consistent', 'map_king', 'veteran',
    'latest_lanterna', 'lanterna_streak',
    'latest_top_kills', 'latest_top_adr', 'latest_top_kdr', 'latest_top_fk', 'latest_top_assists', 'latest_top_deaths',
    'latest_low_fk',
    'bolao_leader', 'bolao_spectator', 'bolao_perfect', 'bolao_miss_streak', 'bolao_zero'
  )
);

insert into public.badges (name, description, unlock_rule, deactivation_rule, icon, color, kind, auto_rule, params) values
  ('Rei do Pitaco', 'O palpite dele vale mais que o ELO de muita gente.',
   'Ser o 1º no ranking do bolão (mínimo de 3 palpites).',
   'Passa para quem assumir a liderança do bolão.', 'img:pitaco', '#F59E0B', 'dynamic', 'bolao_leader', '{"min_bets": 3}'),
  ('Alambrado do Mix', 'Não entra no servidor, mas não perde um palpite. Torcedor raiz de alambrado.',
   'Palpitar em 3 mixes seguidos sem jogar nenhum deles.',
   'Sai quando joga um mix ou deixa de palpitar.', 'img:alambrado', '#EC4899', 'dynamic', 'bolao_spectator', '{"n": 3}'),
  ('Mãe Diná', 'Viu o futuro: cravou vencedor, placar, MVP e lanterna.',
   'Gabaritar um bolão (10 pontos).',
   'Permanente.', 'img:maedina', '#A855F7', 'permanent', 'bolao_perfect', '{}'),
  ('Zicado', 'Apostou no seu time? Já pode se preocupar.',
   'Errar o vencedor em 3 bolões seguidos.',
   'Sai quando acerta o vencedor.', 'img:zicado', '#6366F1', 'dynamic', 'bolao_miss_streak', '{"n": 3}'),
  ('Chutômetro Quebrado', 'Chutou tudo e não acertou nada.',
   'Fazer 0 pontos no bolão do último mix.',
   'Sai quando pontua no próximo bolão.', 'img:chutometro', '#EAB308', 'dynamic', 'bolao_zero', '{}')
on conflict do nothing;
