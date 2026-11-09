-- MeuMix — troca de jogador com o time já tirado
-- Executar depois de 0049. Pode ser executado mais de uma vez.
--
-- Time tirado (PICK concluído) fica travado: reserva entrar ou sair não muda nada.
-- Se um dos classificados sai, o 1º reserva entra no lugar dele (no mesmo time) e os
-- 2 capitães respondem: manter o time (os dois) ou tirar novamente (basta um).

create table if not exists public.mix_draft_reviews (
  schedule_id uuid not null,
  event_date date not null,
  -- [{ "out": uuid, "in": uuid, "side": "A" | "B" }, ...] na ordem das trocas.
  changes jsonb not null default '[]',
  vote_a boolean,
  vote_b boolean,
  status text not null default 'pending' check (status in ('pending', 'kept')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (schedule_id, event_date),
  foreign key (schedule_id, event_date) references public.mix_draft_state (schedule_id, event_date) on delete cascade
);

alter table public.mix_draft_reviews enable row level security;
drop policy if exists "leitura publica" on public.mix_draft_reviews;
create policy "leitura publica" on public.mix_draft_reviews for select using (true);
revoke insert, update, delete on public.mix_draft_reviews from anon, authenticated;
