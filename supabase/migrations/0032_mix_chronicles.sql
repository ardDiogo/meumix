-- MeuMix — crônica do mix ("edição sem dó")
-- Executar depois de 0031. Pode ser executado mais de uma vez.
-- Gerada ao finalizar o mix (IA, com plano B sem IA); o admin pode gerar de
-- novo, editar ou ocultar. Só o servidor lê e escreve.

create table if not exists public.mix_chronicles (
  match_id uuid primary key references public.mix_matches (id) on delete cascade,
  -- { headline, intro, items: [{ emoji, title, text }], closing }
  content jsonb not null,
  source text not null check (source in ('ia', 'modelo', 'admin')),
  hidden boolean not null default false,
  generated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

alter table public.mix_chronicles enable row level security;
revoke all on public.mix_chronicles from anon, authenticated;
