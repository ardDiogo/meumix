-- MeuMix — importação da partida pela página da GC
-- Executar depois de 0034. Pode ser executado mais de uma vez.
-- Um registro por mapa do mix com as estatísticas completas da GC (rating,
-- swing, entries, trades, clutch, utilitárias, mira e o placar round a round),
-- já no lado A/B do mix. Leitura pública, como as estatísticas da partida;
-- só o servidor grava. Os IDs da GC ficam ligados aos jogadores pela tabela
-- player_aliases (apelido "gc:<id>", migração 0030).

create table if not exists public.match_gc_maps (
  match_id uuid not null references public.mix_matches (id) on delete cascade,
  map_order smallint not null check (map_order between 1 and 5),
  map_id text not null,
  -- Número da partida na GC (o do link gamersclub.com.br/lobby/match/<número>).
  gc_match_id text check (gc_match_id ~ '^[0-9]{1,12}$'),
  -- { scoreA, scoreB, rounds: [{ w, r, ct }], players: [{ userId, gcId, nick, team, k, a, d, rating, … }], clips }
  data jsonb not null,
  created_at timestamptz not null default now(),
  primary key (match_id, map_order)
);

alter table public.match_gc_maps enable row level security;
drop policy if exists "leitura publica" on public.match_gc_maps;
create policy "leitura publica" on public.match_gc_maps for select using (true);
revoke insert, update, delete on public.match_gc_maps from anon, authenticated;
