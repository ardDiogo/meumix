-- MeuMix — link pessoal de confirmação de presença (sem login)
-- Executar depois de 0016. Pode ser executado mais de uma vez.
--
-- Cada jogador tem um código secreto; quem abre /c/<código> fica com o celular
-- lembrado e confirma presença pelo link do grupo sem entrar na conta.
-- Só o servidor (chave secreta) lê e grava esta tabela.

create table if not exists public.confirm_links (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  token text not null unique check (token ~ '^[A-Za-z0-9_-]{20,64}$'),
  created_at timestamptz not null default now()
);

alter table public.confirm_links enable row level security;
revoke all on public.confirm_links from anon, authenticated;
