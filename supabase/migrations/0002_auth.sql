-- MeuMix — autenticação e papéis
-- Executar depois de 0001_init.sql.

-- Papel do usuário na plataforma. O super administrador é definido pela
-- variável SUPER_ADMIN_EMAILS no servidor (não fica no banco).
alter table public.profiles
  add column role text not null default 'user' check (role in ('user', 'admin'));

-- Cria o perfil automaticamente quando alguém se cadastra.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Cada usuário pode editar apenas o próprio nome; o papel (role) só é
-- alterado pelo servidor com a chave service role, após checar permissão.
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (display_name) on public.profiles to authenticated;

create policy "usuario edita o proprio perfil" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);
