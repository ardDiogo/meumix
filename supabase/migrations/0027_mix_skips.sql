-- MeuMix — datas de mix excluídas ("Deletar mix" / "Descartar")
-- Executar depois de 0026. Pode ser executado mais de uma vez.
--
-- Correção: a 0010 tentou criar mix_cancellations para isso, mas o nome já
-- existia (0004: registro de quem saiu da lista de inscritos), então a tabela
-- certa nunca foi criada. As datas excluídas passam a ficar em mix_skips;
-- mix_cancellations continua sendo só o registro de saídas da lista.

create table if not exists public.mix_skips (
  schedule_id uuid not null references public.mix_schedules (id) on delete cascade,
  event_date date not null,
  cancelled_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (schedule_id, event_date)
);
alter table public.mix_skips enable row level security;
drop policy if exists "leitura publica" on public.mix_skips;
create policy "leitura publica" on public.mix_skips for select using (true);
revoke insert, update, delete on public.mix_skips from anon, authenticated;

-- Tempo real (as telas abertas somem com a data excluída na hora).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'mix_skips'
     ) then
    alter publication supabase_realtime add table public.mix_skips;
  end if;
end $$;
