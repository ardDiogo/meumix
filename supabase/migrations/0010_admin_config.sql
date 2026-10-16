-- MeuMix — configurações do admin: mapas, níveis, música de fundo e cancelamento de mix
-- Executar depois de 0009. Pode ser executado mais de uma vez.

-- ---------------------------------------------------------------------------
-- Mapas: sigla e ordem de exibição (gerenciados no admin).
-- ---------------------------------------------------------------------------
alter table public.maps add column if not exists short_name text;
alter table public.maps add column if not exists sort_order int not null default 0;
alter table public.maps add column if not exists created_at timestamptz not null default now();

update public.maps set short_name = v.s
from (values ('de_mirage', 'Mr'), ('de_inferno', 'Inf'), ('de_nuke', 'Nk'), ('de_ancient', 'Anc'),
             ('de_anubis', 'Anb'), ('de_dust2', 'D2'), ('de_train', 'Train'), ('de_overpass', 'Ov'),
             ('de_vertigo', 'Vtg')) as v(id, s)
where maps.id = v.id and maps.short_name is null;

-- Ordem inicial alfabética (só se ninguém ordenou ainda).
do $$
begin
  if not exists (select 1 from public.maps where sort_order <> 0) then
    update public.maps m set sort_order = o.n
    from (select id, row_number() over (order by name) as n from public.maps) o
    where m.id = o.id;
  end if;
end $$;

alter table public.maps enable row level security;
drop policy if exists "leitura publica" on public.maps;
create policy "leitura publica" on public.maps for select using (true);
revoke insert, update, delete on public.maps from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Níveis: novas cores padrão (só troca se ainda estiverem nas cores antigas)
-- e gravação validada + recálculo do nível de todos os jogadores.
-- ---------------------------------------------------------------------------
update public.level_configs l set color = v.c
from (values (1, '#7C3AED'), (2, '#2563EB'), (3, '#0284C7'), (4, '#0891B2'), (5, '#059669'),
             (6, '#16A34A'), (7, '#65A30D'), (8, '#CA8A04'), (9, '#EA580C'), (10, '#FF0000')) as v(level, c)
where l.level = v.level
  and not exists (
    select 1 from public.level_configs x
    where x.color not in ('#a1a1aa', '#22c55e', '#eab308', '#f97316', '#ef4444')
  );

create or replace function public.save_level_configs(p_levels jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_prev_max int := -1;
  v_count int := 0;
begin
  for r in
    select (e ->> 'level')::int as level, (e ->> 'elo_min')::int as elo_min,
           (e ->> 'elo_max')::int as elo_max, e ->> 'color' as color
    from jsonb_array_elements(p_levels) e
    order by (e ->> 'level')::int
  loop
    v_count := v_count + 1;
    if r.level <> v_count then raise exception 'LEVELS_SEQUENCE'; end if;
    if r.elo_min <> v_prev_max + 1 then raise exception 'LEVELS_GAP'; end if;
    if r.elo_max < r.elo_min then raise exception 'LEVELS_RANGE'; end if;
    if r.color !~ '^#[0-9A-Fa-f]{6}$' then raise exception 'LEVELS_COLOR'; end if;
    v_prev_max := r.elo_max;
  end loop;
  if v_count <> 10 then raise exception 'LEVELS_COUNT'; end if;

  update public.level_configs l
  set elo_min = (e ->> 'elo_min')::int, elo_max = (e ->> 'elo_max')::int, color = upper(e ->> 'color')
  from jsonb_array_elements(p_levels) e
  where l.level = (e ->> 'level')::int;

  update public.profiles set level = public.level_for_elo(elo) where level <> public.level_for_elo(elo);
end;
$$;
revoke all on function public.save_level_configs(jsonb) from public, anon, authenticated;
grant execute on function public.save_level_configs(jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Configurações gerais (ex.: música de fundo).
-- ---------------------------------------------------------------------------
create table if not exists public.app_settings (
  key text primary key,
  value text,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;
drop policy if exists "leitura publica" on public.app_settings;
create policy "leitura publica" on public.app_settings for select using (true);
revoke insert, update, delete on public.app_settings from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Mix cancelado (admin "deletou" a ocorrência de uma agenda).
-- ---------------------------------------------------------------------------
create table if not exists public.mix_cancellations (
  schedule_id uuid not null references public.mix_schedules (id) on delete cascade,
  event_date date not null,
  cancelled_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (schedule_id, event_date)
);
alter table public.mix_cancellations enable row level security;
drop policy if exists "leitura publica" on public.mix_cancellations;
create policy "leitura publica" on public.mix_cancellations for select using (true);
revoke insert, update, delete on public.mix_cancellations from anon, authenticated;

-- Tempo real.
do $$
declare t text;
begin
  foreach t in array array['maps', 'app_settings', 'mix_cancellations'] loop
    if not exists (
      select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
