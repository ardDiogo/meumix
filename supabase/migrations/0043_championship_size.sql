-- MeuMix — Campeonatos: de 2 a 25 times e playoffs com oitavas (16 times).
-- Executar depois de 0042. Pode ser executado mais de uma vez.
-- Desfazer: voltar os limites (team_count até 16, adedonha até 16 rodadas, sem 'round16_quarters_semis_final').

alter table public.championships drop constraint if exists championships_team_count_check;
alter table public.championships add constraint championships_team_count_check check (team_count between 2 and 25);

alter table public.championships drop constraint if exists championships_playoff_format_check;
alter table public.championships add constraint championships_playoff_format_check
  check (playoff_format in ('none', 'final', 'semis_final', 'quarters_semis_final', 'round16_quarters_semis_final'));

-- Adedonha: uma rodada por posição na ordem (até 24 com 25 times).
alter table public.championship_adedonha_rounds drop constraint if exists championship_adedonha_rounds_round_check;
alter table public.championship_adedonha_rounds add constraint championship_adedonha_rounds_round_check check (round between 1 and 25);
