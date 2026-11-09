-- MeuMix — Ligas: relatório de conferência da Fase 2 (SÓ LÊ, não grava nada)
-- Rode depois da migração 0045_leagues.sql, no SQL Editor do Supabase.
--
-- Mostra como fica a separação pela data ANTES de aplicar:
--   agenda      → as agendas de mix e o dia da semana de cada uma
--   mixes       → quantos mixes finalizados vão para cada liga
--   atencao     → mixes fora de segunda/terça (vão para o Mix da Lanterna)
--   jogador     → ELO de cada um em cada liga (começa no ELO inicial do nível GC e soma o RP dos mixes da liga)
--   duas ligas  → quem jogou nas duas

with dias(n, nome) as (
  values (0, 'domingo'), (1, 'segunda'), (2, 'terça'), (3, 'quarta'), (4, 'quinta'), (5, 'sexta'), (6, 'sábado')
),
prev as (
  select p.*, coalesce(c.name, p.liga) nome_liga
  from public.league_split_preview() p
  left join public.communities c on c.slug = 'principal' and p.liga = 'Mix de Segunda'
),
liga_nome as (
  select slug, name name from public.communities
)
select * from (
  select 1 ordem, 'agenda' secao,
    coalesce(d.nome, 'avulso ' || s.event_date::text) liga,
    to_char(s.event_time, 'HH24:MI') || case when s.active then '' else ' (inativa)' end jogador,
    (select count(*) from public.mix_matches m where m.schedule_id = s.id) mixes,
    null::int elo_atual, null::int elo_liga, null::smallint nivel,
    'agenda ' || s.id::text obs
  from public.mix_schedules s
  left join dias d on d.n = s.weekday

  union all
  select 2, 'mixes', ln.name, null,
    count(*), null, null, null,
    'de ' || min(m.event_date)::text || ' a ' || max(m.event_date)::text
  from public.mix_matches m
  join liga_nome ln on ln.slug = public.league_for_date(m.event_date)
  group by ln.name

  union all
  select 3, 'atencao', d.nome, m.event_date::text,
    null, null, null, null,
    'mix fora de segunda/terça: vai para o Mix da Lanterna (' || m.id::text || ')'
  from public.mix_matches m
  join dias d on d.n = extract(dow from m.event_date)
  where extract(isodow from m.event_date) not in (1, 2)

  union all
  select 4, 'jogador', p.nome_liga, p.jogador, p.mixes, p.elo_atual, p.elo_liga, p.nivel_liga, null
  from prev p

  union all
  select 5, 'duas ligas', null, p.jogador, sum(p.mixes), max(p.elo_atual), null, null,
    string_agg(p.nome_liga || ': ' || p.elo_liga, ' · ' order by p.nome_liga)
  from prev p
  group by p.user_id, p.jogador
  having count(*) > 1
) r
order by ordem, liga nulls first, elo_liga desc nulls last, jogador;
