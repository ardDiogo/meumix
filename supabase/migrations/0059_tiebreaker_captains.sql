-- MeuMix — Desempate de mapas entre os capitães
-- Executar depois de 0058. Pode ser executado mais de uma vez.
--
-- Empate na última vaga dos mapas: em vez dos 10 votarem de novo, só os 2 capitães
-- escolhem. Mapa escolhido pelos dois entra; na discordância, fica com a escolha de
-- quem PERDER o pedra-papel-tesoura (quem ganha escolhe primeiro no PICK).
-- Rounds antigos continuam como estavam (mode = 'players').

alter table public.map_tiebreaker_rounds
  add column if not exists mode text not null default 'players';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'map_tiebreaker_rounds_mode_check') then
    alter table public.map_tiebreaker_rounds
      add constraint map_tiebreaker_rounds_mode_check check (mode in ('players', 'captains'));
  end if;
end $$;
