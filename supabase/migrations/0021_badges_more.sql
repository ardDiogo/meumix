-- MeuMix — regra de desbloqueio das insígnias e mais 20 insígnias com imagens 3D
-- Executar depois de 0020. Pode ser executado mais de uma vez (não duplica pelo nome).

alter table public.badges add column if not exists unlock_rule text check (char_length(unlock_rule) <= 200);

insert into public.badges (name, description, unlock_rule, icon, color) values
  ('Máquina de HS', 'Só aceita bala na cabeça.', 'Alcançar uma porcentagem mínima de headshots em partidas suficientes.', 'img:hs', '#FF6A00'),
  ('Patrão do Mix', 'Quando ele entra, o lobby respeita.', 'Terminar no topo do ranking geral de desempenho.', 'img:patrao', '#EAB308'),
  ('Carrasco', 'O último que você vê é o primeiro a morrer.', 'Acumular eliminações em várias partidas.', 'img:carrasco', '#A1A1AA'),
  ('Mira de Ferro', 'Recuo? Que recuo?', 'Manter boa precisão em um número mínimo de partidas.', 'img:mira', '#EF4444'),
  ('Apagador', 'Entrou no bomb? Apagou o servidor.', 'Conseguir eliminações múltiplas em rodadas diferentes.', 'img:apagador', '#EAB308'),
  ('Muralha', 'Daqui ninguém passa.', 'Alcançar alto índice de sucesso em rounds defensivos, se houver dados disponíveis.', 'img:muralha', '#3B82F6'),
  ('Fantasma', 'Aparece do nada e manda alguém pro lobby.', 'Conseguir eliminações por surpresa ou pelas costas, caso o sistema registre isso.', 'img:fantasma', '#A1A1AA'),
  ('Consistente', 'Não tem dia ruim. Tem dia menos absurdo.', 'Manter desempenho acima da média por 10 mixes.', 'img:consistente', '#EAB308'),
  ('Xadrez 4D', 'Enquanto você mira, ele já pensou no próximo round.', 'Obter bons resultados de forma consistente, com foco em vitórias e impacto.', 'img:xadrez', '#EC4899'),
  ('Terror do Bomb', 'Plantou, acabou a paz.', 'Acumular plants ou vitórias em rounds após plant, conforme os dados disponíveis.', 'img:granada', '#FF6A00'),
  ('O Renascido', 'Tava no fundo do poço. Voltou de AK na mão.', 'Recuperar posições no ranking após uma sequência ruim.', 'img:renascido', '#22C55E'),
  ('Capa de Jornal', 'Fez uma jogada tão absurda que virou notícia.', 'Registrar uma partida com desempenho excepcional ou recorde pessoal.', 'img:jornal', '#EF4444'),
  ('Último Sobrevivente', 'Todo mundo morreu. Ele ainda tá pensando.', 'Vencer situações de clutch, se o sistema tiver esse dado.', 'img:sobrevivente', '#EAB308'),
  ('Parceiro de Guerra', 'Joga pelo time, não pelo placar.', 'Acumular assistências e bom desempenho coletivo.', 'img:parceiro', '#EAB308'),
  ('Foguete', 'Subiu no ranking mais rápido que preço de skin.', 'Subir um número definido de posições no ranking semanal ou mensal.', 'img:foguete', '#06B6D4'),
  ('Pé Frio', 'O time perdeu só de ver o nick.', 'Sequência de derrotas — de preferência com um toque de humor, sem humilhar demais.', 'img:pefrio', '#EF4444'),
  ('Cassino', 'Nunca se sabe se vem um ace ou um desastre.', 'Apresentar grande variação de desempenho entre partidas.', 'img:cassino', '#A1A1AA'),
  ('Rei do Mapa', 'Aqui é território particular.', 'Liderar o ranking de desempenho em um mapa específico após várias partidas.', 'img:reimapa', '#EAB308'),
  ('Veterano de Guerra', 'Já viu mais overtime que muito campeonato.', 'Participar de 50 mixes completos.', 'img:veterano', '#EF4444'),
  ('Lenda do MeuMix', 'O servidor lembra. Os adversários também.', 'Conquistar um marco especial, como 100 mixes e presença no topo do ranking.', 'img:lenda', '#06B6D4')
on conflict do nothing;
