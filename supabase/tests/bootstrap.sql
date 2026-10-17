-- Simula o mínimo do Supabase num Postgres puro, para testar migrações e RLS.
-- Uso: scripts/test-rls.sh (não rode isto no projeto real).
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create schema extensions;
create extension pgcrypto schema extensions;
create table auth.users (
  instance_id uuid, id uuid primary key, aud text, role text, email text, encrypted_password text,
  email_confirmed_at timestamptz, raw_app_meta_data jsonb, raw_user_meta_data jsonb,
  created_at timestamptz, updated_at timestamptz, confirmation_token text, recovery_token text,
  email_change_token_new text, email_change text
);
-- Como no Supabase: o id do usuário vem do JWT (request.jwt.claims).
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid
$$;
grant usage on schema public, auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated;
-- Privilégios padrão que o Supabase dá aos papéis da API (as migrações revogam o que não pode).
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
create publication supabase_realtime;
