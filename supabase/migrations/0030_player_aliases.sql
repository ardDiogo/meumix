-- MeuMix — apelidos de jogadores nos prints (ex.: "As vezes sei la da um trem loco" → Canindex)
-- Executar depois de 0029. Pode ser executado mais de uma vez.
-- Gravados quando o admin vincula um nick do print a um jogador cadastrado na
-- finalização; nas próximas leituras o nick é reconhecido sozinho.
-- Só o servidor lê e escreve (painel de admin).

create table if not exists public.player_aliases (
  alias_norm text primary key check (char_length(alias_norm) between 1 and 64),
  alias text not null check (char_length(alias) between 1 and 64),
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists player_aliases_user_idx on public.player_aliases (user_id);

alter table public.player_aliases enable row level security;
revoke all on public.player_aliases from anon, authenticated;
