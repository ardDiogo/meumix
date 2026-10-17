-- MeuMix — insígnias da comunidade com imagens 3D (arquivos em /public/badges)
-- Executar depois de 0015. Pode ser executado mais de uma vez (não duplica pelo nome).

insert into public.badges (name, description, icon, color) values
  ('Galinha', 'Assassino de galinhas', 'img:galinha', '#EAB308'),
  ('Erva', 'Jogador que adora uma fumacinha', 'img:erva', '#22C55E'),
  ('Pescador', 'Especialista em fisgar inimigos', 'img:pescador', '#06B6D4'),
  ('Granada', 'Melhor utilitarista do servidor', 'img:granada', '#A1A1AA'),
  ('Melhor', 'Melhor jogador de 2025', 'img:melhor', '#EAB308'),
  ('Bebado', 'O bebum dos bebuns', 'img:bebado', '#EAB308'),
  ('Lanterna', 'Obteve a pior performance', 'img:lanterna', '#A1A1AA'),
  ('Chorão', 'O maior bebê chorão do caralho', 'img:chorao', '#EC4899'),
  ('Morte', 'Não dá 5 segundos e já tá morto', 'img:morte', '#A1A1AA'),
  ('Entry Fragger', 'O que mais faz Entry Fragger (não o melhor)', 'img:entry', '#FF6A00'),
  ('Ninja', 'O mais ninja e sorrateiro', 'img:ninja', '#A855F7'),
  ('Faca', 'Mata mais na faca que na bala', 'img:faca', '#EF4444'),
  ('Baiter', 'Baiter medroso', 'img:baiter', '#3B82F6'),
  ('Tap', 'Tap Machine', 'img:tap', '#22C55E'),
  ('Puta do Koder', 'É puta fiel do Koder', 'img:puta', '#EC4899'),
  ('Ditador', 'Ditador de nada', 'img:ditador', '#22C55E'),
  ('Filho do Koder', 'Filho do Koder, sempre dominado', 'img:filho', '#EAB308')
on conflict do nothing;
