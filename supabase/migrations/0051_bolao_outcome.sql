-- MeuMix — bolão sem depender do número de mapas
-- Executar depois de 0050. Pode ser executado mais de uma vez.
--
-- O mix pode ter 2, 3 ou 4 mapas, então o palpite deixa de ser o placar exato e passa a ser:
--   • vitória seca (o vencedor não perde mapa: 2×0, 3×0, 4×0)  → kind = 'sweep'
--   • vitória com deslize (o vencedor perde mapa: 2×1, 3×1…)    → kind = 'close'
--   • empate (1×1, 2×2)                                         → kind = 'draw' (sem time vencedor)
-- Palpites antigos viram 'sweep' (placar com 0) ou 'close'.

alter table public.mix_predictions
  add column if not exists kind text check (kind in ('sweep', 'close', 'draw'));

update public.mix_predictions
set kind = case when maps_lost = 0 then 'sweep' else 'close' end
where kind is null and winner_captain is not null;

-- Empate não tem time vencedor nem placar.
alter table public.mix_predictions alter column winner_captain drop not null;
alter table public.mix_predictions alter column maps_won drop not null;
alter table public.mix_predictions alter column maps_lost drop not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'mix_predictions_kind_winner') then
    alter table public.mix_predictions
      add constraint mix_predictions_kind_winner
      check (kind is null or (kind = 'draw') = (winner_captain is null));
  end if;
end;
$$;

-- Texto da insígnia Mãe Diná (gabaritar continua valendo 10 pontos).
update public.badges
set description = 'Viu o futuro: cravou o resultado (seca, com deslize ou empate), o MVP e a lanterna.'
where auto_rule = 'bolao_perfect' and description like '%placar%';
