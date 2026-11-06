-- MeuMix — Campeonatos (Etapa 7): resultados por mapa (manual ou importados da GC).
-- Executar depois de 0040. Pode ser executado mais de uma vez.
-- A classificação é calculada na hora a partir destes placares (nada derivado é guardado).
-- Leitura pública; escrita só pelo servidor. Nada aqui toca nas tabelas do mix.
-- Desfazer: drop table championship_match_maps.

do $$
begin
  if to_regclass('public.championship_matches') is null then
    raise exception 'Rode primeiro a migração 0040_championship_matches.sql.';
  end if;
end $$;

create table if not exists public.championship_match_maps (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.championship_matches (id) on delete cascade,
  championship_id uuid not null references public.championships (id) on delete cascade,
  map_order int not null check (map_order between 1 and 5),
  map_id text not null check (char_length(map_id) between 1 and 32),
  score_home int not null check (score_home between 0 and 99),
  score_away int not null check (score_away between 0 and 99),
  -- Partida da GC de onde veio (uma partida da GC entra uma vez só no campeonato).
  gc_match_id text check (gc_match_id is null or gc_match_id ~ '^[0-9]{1,12}$'),
  -- Estatísticas completas da GC (mesmo formato do mix, com o mandante como time A).
  data jsonb,
  recorded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (match_id, map_order),
  check (score_home <> score_away)
);
create unique index if not exists championship_match_maps_gc
  on public.championship_match_maps (championship_id, gc_match_id) where gc_match_id is not null;
create index if not exists championship_match_maps_ch on public.championship_match_maps (championship_id);

alter table public.championship_match_maps enable row level security;
drop policy if exists "leitura publica" on public.championship_match_maps;
create policy "leitura publica" on public.championship_match_maps for select using (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'championship_match_maps'
  ) then
    alter publication supabase_realtime add table public.championship_match_maps;
  end if;
end $$;
