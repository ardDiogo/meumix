-- MeuMix — privacidade do perfil (docs/seguranca, P-01 e P-13)
-- Executar depois de 0022. Pode ser executado mais de uma vez.
--
-- P-01: o nome completo deixa de ser lido pela API pública. A leitura passa a
-- ser liberada coluna a coluna: todas as colunas atuais, menos as privadas.
-- ATENÇÃO: coluna nova em profiles NÃO fica legível pela API até receber
-- "grant select (coluna) on public.profiles to anon, authenticated" na migração
-- que a cria (se for pública).
--
-- P-13: o nick só muda pelo servidor (que valida tamanho e formato); o jogador
-- não edita mais o perfil direto pela API.

do $$
declare
  private_cols constant text[] := array['full_name'];
  cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'profiles' and column_name <> all (private_cols);

  execute 'revoke select on public.profiles from anon, authenticated';
  execute format('grant select (%s) on public.profiles to anon, authenticated', cols);
end $$;

revoke update on public.profiles from anon, authenticated;
drop policy if exists "usuario edita o proprio perfil" on public.profiles;
