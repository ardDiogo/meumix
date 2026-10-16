-- MeuMix — nome completo no perfil e cadastro em lote pelo admin
-- Executar depois de 0007. Pode ser executado mais de uma vez.

alter table public.profiles add column if not exists full_name text;

-- Cadastro: grava também o nome completo enviado nos metadados.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gc int := nullif(new.raw_user_meta_data ->> 'gc_level', '')::int;
  v_elo int := public.initial_elo_from_gc(v_gc);
begin
  insert into public.profiles (id, display_name, full_name, gc_level, elo, level)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1)),
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    case when v_gc between 0 and 20 then v_gc end,
    v_elo,
    public.level_for_elo(v_elo)
  );
  return new;
end;
$$;
