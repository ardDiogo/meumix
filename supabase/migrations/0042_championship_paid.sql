-- MeuMix — Campeonatos (Etapa 9): número de inscrições pagas (o pagamento é controlado fora do site).
-- Executar depois de 0041. Pode ser executado mais de uma vez.
-- Sem valor, a premiação usa o número de inscritos.
-- Desfazer: alter table public.championships drop column paid_players.

alter table public.championships
  add column if not exists paid_players int check (paid_players is null or paid_players between 0 and 1000);
