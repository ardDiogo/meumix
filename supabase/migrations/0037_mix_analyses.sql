-- MeuMix — análise da partida escrita pela IA (mixes importados da GC)
-- Executar depois de 0036. Pode ser executado mais de uma vez.
-- Um texto por jogador, gerado ao finalizar o mix ou pelo admin; sem ele, a
-- página mostra a versão por regras. Só o servidor lê e escreve.

create table if not exists public.mix_analyses (
  match_id uuid primary key references public.mix_matches (id) on delete cascade,
  -- { "<userId ou gc:id>": { text, tip } }
  content jsonb not null,
  generated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

alter table public.mix_analyses enable row level security;
revoke all on public.mix_analyses from anon, authenticated;
