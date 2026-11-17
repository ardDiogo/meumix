-- MeuMix — Titulares da liga e atraso de inscrição para os demais
-- Executar depois de 0053. Pode ser executado mais de uma vez.
--
-- • league_members.starter: o admin da liga marca quem é titular.
-- • communities.non_starter_delay_minutes: quem não é titular só consegue se inscrever
--   esse tempo depois da abertura (0 = desligado, todos abrem juntos).
--   Começa desligado: marque os titulares antes de ligar o atraso.

alter table public.league_members add column if not exists starter boolean not null default false;
alter table public.communities add column if not exists non_starter_delay_minutes int not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'communities_non_starter_delay_range') then
    alter table public.communities add constraint communities_non_starter_delay_range
      check (non_starter_delay_minutes between 0 and 1440);
  end if;
end $$;
